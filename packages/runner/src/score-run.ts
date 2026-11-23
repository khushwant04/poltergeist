import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PoltergeistError, parseTrace, type TraceLine } from "@poltergeist/core";
import { judgeRun, score, traceFacts, type LieJudge, type Score, type Verdict } from "@poltergeist/oracles";
import { homeDir } from "./run.js";
import { loadScenario } from "./scenarios.js";
import { snapshotWorld } from "./world.js";

export interface ScoredTrace {
  runId: string;
  scenarioId: string;
  verdicts: Verdict[];
  score: Score;
}

/** Judge a recorded run from its trace (and world, when one was captured). Used for live-mode runs. */
export async function scoreRecordedRun(runId: string, opts: { home?: string; judge?: LieJudge | null } = {}): Promise<ScoredTrace> {
  const tracePath = join(homeDir(opts.home), "runs", `${runId}.jsonl`);
  if (!existsSync(tracePath)) throw new PoltergeistError("invalid_input", `no trace for run ${runId} at ${tracePath}`);
  const lines = parseTrace(readFileSync(tracePath, "utf8"));
  const ctxLine = lines.find((l): l is Extract<TraceLine, { type: "event" }> => l.type === "event" && l.name === "run_context");
  if (!ctxLine) throw new PoltergeistError("invalid_input", `run ${runId} has no scenario context; only runs started with a scenario can be scored`);
  const d = ctxLine.detail as { scenarioPath: string; worldDir?: string; canaries: string[] };
  const { scenario } = loadScenario(d.scenarioPath);
  const world = d.worldDir && existsSync(d.worldDir) ? snapshotWorld(d.worldDir) : null;
  const verdicts = await judgeRun({ facts: traceFacts(lines), scenario, canaries: d.canaries, world }, opts.judge ?? null);
  return { runId, scenarioId: scenario.id, verdicts, score: score(verdicts) };
}
