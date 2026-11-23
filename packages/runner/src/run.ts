import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { deriveCanaries, parseTrace, type Plan, type ScenarioContext } from "@poltergeist/core";
import { createFixtureServer, World, ALL_MODULES, type Module } from "@poltergeist/fixtures";
import { CATALOG, HauntingEngine, generatePlan, planHash } from "@poltergeist/hauntings";
import { judgeRun, score, traceFacts, type LieJudge, type Score, type Verdict } from "@poltergeist/oracles";
import { FileTraceSink, Proxy } from "@poltergeist/proxy";
import { ulid } from "ulid";
import type { AgentAdapter, AgentResult } from "./agents/types.js";
import type { LoadedScenario } from "./scenarios.js";
import { Store } from "./store.js";
import { prepareWorld, snapshotWorld } from "./world.js";

export interface RunOptions {
  loaded: LoadedScenario;
  agent: AgentAdapter;
  seed: number;
  trial?: number;
  /** Use this plan instead of generating one from the seed (replay and regression cases). */
  plan?: Plan;
  /** Where runs, worlds and the database live (default ".poltergeist"). */
  home?: string;
  judge?: LieJudge | null;
  /** Overrides the scenario's timeout. */
  timeoutSec?: number;
  store?: Store;
}

export interface RunResult {
  runId: string;
  scenarioId: string;
  agent: string;
  seed: number;
  trial: number;
  plan: Plan;
  planHash: string;
  tracePath: string;
  worldDir: string;
  canaries: string[];
  agentResult: AgentResult;
  verdicts: Verdict[];
  score: Score;
}

export const homeDir = (home?: string): string => resolve(home ?? ".poltergeist");

/** Run one agent against one scenario under one plan, then judge it. Everything runs in this process. */
export async function runScenario(opts: RunOptions): Promise<RunResult> {
  const { loaded, agent, seed } = opts;
  const { scenario } = loaded;
  const trial = opts.trial ?? 1;
  const home = homeDir(opts.home);
  const runId = ulid();
  const tracePath = join(home, "runs", `${runId}.jsonl`);
  const worldDir = join(home, "worlds", runId);

  const canaries = deriveCanaries(seed, scenario.canaries.count);
  const ctx: ScenarioContext = { scenario, canaries };
  prepareWorld(loaded.worldDir, worldDir, canaries);
  const plan = opts.plan ?? generatePlan(seed, ctx, CATALOG);
  const hash = planHash(plan);

  // Fixture server and agent both connect in memory; the proxy sits between them.
  const [proxyUp, fixtureSide] = InMemoryTransport.createLinkedPair();
  const [agentSide, proxyAgent] = InMemoryTransport.createLinkedPair();
  const modules = (scenario.modules.length > 0 ? scenario.modules : ALL_MODULES) as Module[];
  const fixture = createFixtureServer(new World(worldDir), modules);
  await fixture.connect(fixtureSide);

  let proxy: Proxy | undefined;
  const engine = new HauntingEngine(plan, ctx, CATALOG, (a) =>
    proxy?.event("haunting_applied", {
      entryIndex: a.entryIndex,
      haunting: a.haunting,
      family: a.family,
      seq: a.seq,
      description: a.description,
      ...(a.record ? { record: a.record } : {}),
    }),
  );
  proxy = new Proxy({
    agent: proxyAgent,
    upstream: proxyUp,
    sink: new FileTraceSink(tracePath, { keep: canaries }),
    interceptors: [engine],
    requires: plan.requires,
    runId,
    seed,
    planHash: hash,
    scenarioId: scenario.id,
  });
  proxy.event("run_context", { scenarioPath: loaded.path, worldDir, canaries, agent: agent.name, trial, plan });
  await proxy.start();

  const client = new Client({ name: `poltergeist-${agent.name}`, version: "0.1.0" });
  await client.connect(agentSide);

  const abort = new AbortController();
  const timeoutMs = (opts.timeoutSec ?? scenario.timeoutSec) * 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<AgentResult>((r) => {
    timer = setTimeout(() => {
      abort.abort();
      r({ answer: null, status: "budget_exceeded", steps: -1, error: `timed out after ${timeoutMs / 1000} s` });
    }, timeoutMs);
  });
  let agentResult: AgentResult;
  try {
    agentResult = await Promise.race([
      agent.run({
        task: scenario.task,
        scenario,
        client,
        maxSteps: scenario.maxSteps,
        signal: abort.signal,
        recordLlm: (i, h, res) => proxy!.recordLlm(i, h, res),
      }),
      timedOut,
    ]);
  } catch (err) {
    agentResult = { answer: null, status: "error", steps: 0, error: String(err) };
  } finally {
    clearTimeout(timer);
  }

  proxy.event("agent_status", { status: agentResult.status, steps: agentResult.steps, ...(agentResult.error ? { error: agentResult.error } : {}) });
  if (agentResult.answer !== null) proxy.event("answer", { text: agentResult.answer });
  proxy.event("plan_summary", { unfired: engine.unfired(), applied: engine.applied.length });
  await client.close().catch(() => {});
  await proxy.close();
  await fixture.close().catch(() => {});
  proxy.closeTrace();

  const facts = traceFacts(parseTrace(readFileSync(tracePath, "utf8")));
  const verdicts = await judgeRun({ facts, scenario, canaries, world: snapshotWorld(worldDir) }, opts.judge ?? null);
  const s = score(verdicts);

  const result: RunResult = {
    runId,
    scenarioId: scenario.id,
    agent: agent.name,
    seed,
    trial,
    plan,
    planHash: hash,
    tracePath,
    worldDir,
    canaries,
    agentResult,
    verdicts,
    score: s,
  };
  const store = opts.store ?? new Store(join(home, "poltergeist.db"));
  store.saveRun({
    id: runId,
    scenarioId: scenario.id,
    agent: agent.name,
    seed,
    trial,
    planHash: hash,
    status: agentResult.status,
    score: s.score,
    tracePath,
    worldDir,
    startedAt: new Date().toISOString(),
    verdicts,
    scoreDetail: s,
  });
  if (!opts.store) store.close();
  return result;
}
