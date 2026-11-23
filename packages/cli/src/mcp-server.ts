import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ulid } from "ulid";
import { z } from "zod";
import { PoltergeistError } from "@poltergeist/core";
import type { OracleId } from "@poltergeist/oracles";
import {
  Store,
  buildBundle,
  catalogEntries,
  homeDir,
  judgeFromEnv,
  loadScenario,
  replayRun,
  resolveScenarioRef,
  runScenario,
  shrinkRun,
} from "@poltergeist/runner";
import { join } from "node:path";
import { makeAgent } from "./run-command.js";

type Job = { kind: "run" | "shrink"; status: "running" | "done" | "error"; error?: string; result?: unknown };

const text = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const toolError = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** Poltergeist as an MCP server, so an IDE agent (Kiro, …) can run, inspect, replay and shrink hauntings. */
export function createPoltergeistMcp(opts: { root: string; home?: string }): McpServer {
  const root = resolve(opts.root);
  const home = opts.home ?? join(root, ".poltergeist");
  const jobs = new Map<string, Job>();
  const server = new McpServer({ name: "poltergeist", version: "0.1.0" });

  const guard = async (fn: () => Promise<CallToolResult>): Promise<CallToolResult> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PoltergeistError) return toolError(err.message + (err.hint ? ` (${err.hint})` : ""));
      return toolError(`Poltergeist failed: ${String(err)}`);
    }
  };

  server.registerTool(
    "haunt_catalog",
    { description: "List the hauntings Poltergeist can inject, with what each one tests." },
    async () => text(catalogEntries()),
  );

  server.registerTool(
    "haunt_run",
    {
      description:
        "Start haunted runs of an agent against a scenario (by id, e.g. inbox-summary, or a path under scenarios/). Returns run ids at once; check results with haunt_report.",
      inputSchema: {
        scenario: z.string().describe("Scenario id or path inside the repository's scenarios/ folder"),
        seed: z.number().int().min(0).max(0xffffffff).default(1),
        trials: z.number().int().min(1).max(5).default(1),
        agent: z.enum(["fake", "reference", "reference-hardened"]).default("fake"),
        fallFor: z.array(z.enum(["possession", "whisper"])).default([]).describe("Fake agent only: hauntings it obeys"),
      },
    },
    async ({ scenario, seed, trials, agent, fallFor }) =>
      guard(async () => {
        const loaded = loadScenario(resolveScenarioRef(root, scenario));
        const adapter = makeAgent(agent, fallFor.join(","));
        const runIds: string[] = [];
        for (let trial = 1; trial <= trials; trial++) {
          const runId = ulid();
          runIds.push(runId);
          jobs.set(runId, { kind: "run", status: "running" });
          void runScenario({ loaded, agent: adapter, seed, trial, runId, home, judge: judgeFromEnv() })
            .then((r) => jobs.set(runId, { kind: "run", status: "done", result: { score: r.score.score } }))
            .catch((err: unknown) => jobs.set(runId, { kind: "run", status: "error", error: String(err) }));
        }
        return text({ runIds, next: "Call haunt_report with each run id." });
      }),
  );

  server.registerTool(
    "haunt_report",
    {
      description: "Report a run (score, failing checks with evidence, hauntings that fired) or a shrink job.",
      inputSchema: { id: z.string().regex(/^[0-9A-Za-z_-]+$/).describe("A run id or a shrink job id") },
    },
    async ({ id }) =>
      guard(async () => {
        const job = jobs.get(id);
        if (job?.status === "running") return text({ id, status: "running" });
        if (job?.status === "error") return text({ id, status: "error", error: job.error });
        if (job?.kind === "shrink") return text({ id, status: "done", ...(job.result as object) });
        const store = new Store(join(homeDir(home), "poltergeist.db"));
        try {
          const b = await buildBundle(id, { home, store, regressionsDir: join(root, "scenarios", "regressions") });
          return text({
            id,
            status: "done",
            scenario: b.scenario.id,
            agent: b.agent,
            score: b.score.score,
            capped: b.score.capped,
            failing: b.verdicts.filter((v) => v.applicable && !v.pass).map((v) => ({ oracle: v.oracle, reason: v.reason, evidence: v.evidence.excerpt })),
            hauntings: b.applied.map((a) => a.description),
            answer: b.answer,
          });
        } finally {
          store.close();
        }
      }),
  );

  server.registerTool(
    "haunt_replay",
    {
      description: "Replay a recorded run: full (exact, from the recording) or env (same plan, agent runs live).",
      inputSchema: { runId: z.string().regex(/^[0-9A-Za-z_-]+$/), mode: z.enum(["full", "env"]).default("full") },
    },
    async ({ runId, mode }) =>
      guard(async () => {
        const r = await replayRun(runId, { mode, home });
        return text({ mode, newRunId: r.run.runId, score: r.run.score.score, equivalent: r.equivalent, divergence: r.divergence?.message ?? null });
      }),
  );

  server.registerTool(
    "haunt_shrink",
    {
      description: "Shrink a failing run to the smallest set of hauntings that still fails the given check. Returns a job id for haunt_report.",
      inputSchema: {
        runId: z.string().regex(/^[0-9A-Za-z_-]+$/),
        target: z.enum(["canary-leak", "forbidden-call", "injection-obedience", "task-completed", "recovered", "spotted-the-lie"]),
        budget: z.number().int().min(1).max(200).default(40),
      },
    },
    async ({ runId, target, budget }) =>
      guard(async () => {
        const jobId = `shrink-${ulid()}`;
        jobs.set(jobId, { kind: "shrink", status: "running" });
        void shrinkRun(runId, { target: target as OracleId, budget, home, judge: judgeFromEnv(), regressionsDir: join(root, "scenarios", "regressions") })
          .then((r) =>
            jobs.set(jobId, {
              kind: "shrink",
              status: "done",
              result: { from: r.original.entries.length, to: r.minimal.entries.length, minimal: r.minimal.entries, failureRate: r.failureRate, regressionPath: r.regressionPath, outcome: r.status },
            }),
          )
          .catch((err: unknown) => jobs.set(jobId, { kind: "shrink", status: "error", error: String(err) }));
        return text({ jobId, next: "Call haunt_report with this job id." });
      }),
  );

  return server;
}

export async function runMcp(opts: { root?: string; home?: string }): Promise<void> {
  const server = createPoltergeistMcp({ root: opts.root ?? process.cwd(), ...(opts.home ? { home: opts.home } : {}) });
  await server.connect(new StdioServerTransport());
}
