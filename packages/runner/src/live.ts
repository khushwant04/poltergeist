import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { deriveCanaries, type Logger, type Plan } from "@poltergeist/core";
import { ALL_MODULES, World, createFixtureServer, type Module } from "@poltergeist/fixtures";
import { CATALOG, HauntingEngine, generatePlan, planHash } from "@poltergeist/hauntings";
import { FileTraceSink, Proxy } from "@poltergeist/proxy";
import { ulid } from "ulid";
import { homeDir } from "./run.js";
import type { LoadedScenario } from "./scenarios.js";
import { prepareWorld } from "./world.js";

export interface HauntSession {
  runId: string;
  tracePath: string;
  worldDir: string;
  plan: Plan;
  /** Resolves when the agent disconnects. */
  done: Promise<void>;
  stop(): Promise<void>;
}

/**
 * Live mode: serve the haunted fixture world over stdio to any MCP client (Kiro, Claude Desktop, Cursor…),
 * record the run, and leave it to `poltergeist score <runId>`.
 */
export async function startHauntSession(opts: {
  loaded: LoadedScenario;
  seed: number;
  home?: string;
  agent?: Transport;
  logger?: Logger;
}): Promise<HauntSession> {
  const { scenario } = opts.loaded;
  const home = homeDir(opts.home);
  const runId = ulid();
  const tracePath = join(home, "runs", `${runId}.jsonl`);
  const worldDir = join(home, "worlds", runId);
  const canaries = deriveCanaries(opts.seed, scenario.canaries.count);
  const ctx = { scenario, canaries };
  prepareWorld(opts.loaded.worldDir, worldDir, canaries);
  const plan = generatePlan(opts.seed, ctx, CATALOG);

  const [proxyUp, fixtureSide] = InMemoryTransport.createLinkedPair();
  const modules = (scenario.modules.length > 0 ? scenario.modules : ALL_MODULES) as Module[];
  const fixture = createFixtureServer(new World(worldDir), modules);
  await fixture.connect(fixtureSide);

  let proxy: Proxy | undefined;
  const engine = new HauntingEngine(plan, ctx, CATALOG, (a) =>
    proxy?.event("haunting_applied", { entryIndex: a.entryIndex, haunting: a.haunting, family: a.family, seq: a.seq, description: a.description, ...(a.record ? { record: a.record } : {}) }),
  );
  const agent = opts.agent ?? new StdioServerTransport();
  proxy = new Proxy({
    agent,
    upstream: proxyUp,
    sink: new FileTraceSink(tracePath, { keep: canaries }),
    interceptors: [engine],
    requires: plan.requires,
    runId,
    seed: opts.seed,
    planHash: planHash(plan),
    scenarioId: scenario.id,
    ...(opts.logger ? { logger: opts.logger } : {}),
  });
  proxy.event("run_context", { scenarioPath: opts.loaded.path, worldDir, canaries, agent: "external", trial: 1, plan });
  await proxy.start();
  if (opts.agent === undefined) process.stdin.once("end", () => void agent.close());

  const p = proxy;
  const done = p.closed.then(async () => {
    p.event("plan_summary", { unfired: engine.unfired(), applied: engine.applied.length });
    await fixture.close().catch(() => {});
    p.closeTrace();
  });
  return {
    runId,
    tracePath,
    worldDir,
    plan,
    done,
    stop: async () => {
      await p.close();
      await done;
    },
  };
}
