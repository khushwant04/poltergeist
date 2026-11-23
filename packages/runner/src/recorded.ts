import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_VERSION, FAST_CHECK_VERSION, POLTERGEIST_VERSION, PlanSchema, PoltergeistError, parseTrace, type Plan, type TraceHeader, type TraceLine } from "@poltergeist/core";
import { homeDir } from "./run.js";
import { loadScenario, type LoadedScenario } from "./scenarios.js";

export interface RecordedRun {
  runId: string;
  tracePath: string;
  lines: TraceLine[];
  header: TraceHeader;
  loaded: LoadedScenario;
  plan: Plan;
  agent: string;
  trial: number;
  seed: number;
  worldDir: string;
}

/** Load a recorded run and everything needed to run it again. */
export function loadRecordedRun(runId: string, opts: { home?: string; force?: boolean } = {}): RecordedRun {
  const tracePath = join(homeDir(opts.home), "runs", `${runId}.jsonl`);
  if (!existsSync(tracePath)) throw new PoltergeistError("invalid_input", `no trace for run ${runId} at ${tracePath}`);
  const lines = parseTrace(readFileSync(tracePath, "utf8"));
  const header = lines[0];
  if (header?.type !== "header") throw new PoltergeistError("invalid_input", `trace ${tracePath} has no header`);
  const ctx = lines.find((l): l is Extract<TraceLine, { type: "event" }> => l.type === "event" && l.name === "run_context");
  if (!ctx) throw new PoltergeistError("invalid_input", `run ${runId} was not started by the runner, so it has no scenario context`);
  const d = ctx.detail as { scenarioPath: string; plan: unknown; agent: string; trial?: number; worldDir: string };

  const current = { poltergeist: POLTERGEIST_VERSION, catalog: CATALOG_VERSION, fastCheck: FAST_CHECK_VERSION };
  const mismatch = (Object.keys(current) as Array<keyof typeof current>).filter((k) => header.versions[k] !== current[k]);
  if (mismatch.length > 0 && !opts.force) {
    throw new PoltergeistError(
      "invalid_input",
      `run ${runId} was recorded with ${mismatch.map((k) => `${k} ${header.versions[k]}`).join(", ")}, but this build has ${mismatch.map((k) => `${k} ${current[k]}`).join(", ")}`,
      "Pass --force to replay anyway.",
    );
  }
  const plan = PlanSchema.parse(d.plan);
  return {
    runId,
    tracePath,
    lines,
    header,
    loaded: loadScenario(d.scenarioPath),
    plan,
    agent: d.agent,
    trial: d.trial ?? 1,
    seed: header.seed ?? plan.seed,
    worldDir: d.worldDir,
  };
}
