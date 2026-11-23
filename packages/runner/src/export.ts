import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PoltergeistError,
  lineToFrame,
  parseTrace,
  type BundleApplied,
  type BundleIndex,
  type BundleIndexEntry,
  type CatalogEntry,
  type RunBundle,
  type TraceLine,
} from "@poltergeist/core";
import { CATALOG } from "@poltergeist/hauntings";
import { judgeRun, score, traceFacts, type LieJudge } from "@poltergeist/oracles";
import { redactValue } from "@poltergeist/proxy";
import { loadRegressions } from "@poltergeist/replay";
import { homeDir } from "./run.js";
import { loadScenario } from "./scenarios.js";
import { Store } from "./store.js";
import { snapshotWorld } from "./world.js";

export interface ExportOptions {
  home?: string;
  /** Regression cases to attach as shrink results (matched by the run they came from). */
  regressionsDir?: string | null;
  /** Patterns to redact again before writing. Canaries are never redacted. */
  redact?: RegExp[];
  judge?: LieJudge | null;
}

export function catalogEntries(): CatalogEntry[] {
  return CATALOG.hauntings.map((h) => ({ id: h.id, family: h.family, summary: h.summary, tests: h.tests }));
}

const ctxOf = (lines: TraceLine[]) =>
  lines.find((l): l is Extract<TraceLine, { type: "event" }> => l.type === "event" && l.name === "run_context")?.detail as
    | { scenarioPath: string; worldDir?: string; canaries?: string[]; agent?: string; trial?: number; plan?: RunBundle["plan"] }
    | undefined;

/** Build the bundle for one recorded run. */
export async function buildBundle(runId: string, opts: ExportOptions & { store?: Store } = {}): Promise<RunBundle> {
  const home = homeDir(opts.home);
  const tracePath = join(home, "runs", `${runId}.jsonl`);
  if (!existsSync(tracePath)) throw new PoltergeistError("invalid_input", `no trace for run ${runId}`);
  const lines = parseTrace(readFileSync(tracePath, "utf8"));
  const header = lines[0];
  if (header?.type !== "header") throw new PoltergeistError("invalid_input", `trace for ${runId} has no header`);
  const ctx = ctxOf(lines);
  if (!ctx) throw new PoltergeistError("invalid_input", `run ${runId} has no scenario context`);
  const { scenario } = loadScenario(ctx.scenarioPath);
  const facts = traceFacts(lines);
  const canaries = ctx.canaries ?? [];

  const stored = opts.store?.getRun(runId);
  const verdicts =
    stored?.verdicts ??
    (await judgeRun({ facts, scenario, canaries, world: ctx.worldDir && existsSync(ctx.worldDir) ? snapshotWorld(ctx.worldDir) : null }, opts.judge ?? null));
  const s = stored?.scoreDetail ?? score(verdicts);

  const applied: BundleApplied[] = facts.applied.map((a) => ({ ...a }));
  const bundle: RunBundle = {
    version: 1,
    runId,
    startedAt: header.startedAt,
    versions: header.versions,
    scenario: { id: scenario.id, task: scenario.task },
    agent: ctx.agent ?? "external",
    seed: header.seed ?? 0,
    trial: ctx.trial ?? 1,
    status: facts.agentStatus ?? stored?.status ?? "external",
    planHash: header.planHash,
    plan: ctx.plan ?? null,
    frames: lines.filter((l): l is Extract<TraceLine, { type: "frame" }> => l.type === "frame").map(lineToFrame),
    applied,
    answer: facts.answer,
    verdicts,
    score: { score: s.score, capped: s.capped, families: s.families },
  };

  if (opts.regressionsDir) {
    const match = loadRegressions(opts.regressionsDir).find((r) => r.regression.fromRunId === runId);
    if (match && ctx.plan) {
      const r = match.regression;
      bundle.shrink = { status: r.partial ? "partial" : "minimal", target: r.target, original: ctx.plan, minimal: r.plan, failureRate: r.failureRate, confirmTrials: 5 };
    }
  }
  return redactValue(bundle, { patterns: opts.redact ?? [], keep: canaries }) as RunBundle;
}

export const indexEntry = (b: RunBundle, live = false): BundleIndexEntry => ({
  runId: b.runId,
  startedAt: b.startedAt,
  scenarioId: b.scenario.id,
  agent: b.agent,
  seed: b.seed,
  trial: b.trial,
  status: b.status,
  score: b.score.score,
  capped: b.score.capped,
  hauntings: [...new Set(b.applied.map((a) => a.haunting))],
  failing: b.verdicts.filter((v) => v.applicable && !v.pass).map((v) => v.oracle),
  hasShrink: b.shrink !== undefined,
  ...(live ? { live: true } : {}),
});

/** Run ids that have a trace, newest first. */
export function recordedRunIds(home?: string): string[] {
  const dir = join(homeDir(home), "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.slice(0, -".jsonl".length))
    .sort()
    .reverse();
}

/** Write bundles/<runId>.json, bundles/index.json and bundles/catalog.json under `out`. */
export async function exportBundles(out: string, runIds: string[] | "all", opts: ExportOptions = {}): Promise<BundleIndex> {
  const ids = runIds === "all" ? recordedRunIds(opts.home) : runIds;
  const dir = join(out, "bundles");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(homeDir(opts.home), "poltergeist.db");
  const store = existsSync(dbPath) ? new Store(dbPath) : undefined;
  const entries: BundleIndexEntry[] = [];
  try {
    for (const id of ids) {
      let b: RunBundle;
      try {
        b = await buildBundle(id, { ...opts, ...(store ? { store } : {}) });
      } catch (err) {
        if (runIds === "all" && err instanceof PoltergeistError) continue; // skip runs without a scenario context
        throw err;
      }
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(b));
      entries.push(indexEntry(b));
    }
  } finally {
    store?.close();
  }
  const index: BundleIndex = { version: 1, generatedAt: new Date().toISOString(), runs: entries.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)) };
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 1));
  writeFileSync(join(dir, "catalog.json"), JSON.stringify(catalogEntries(), null, 1));
  return index;
}
