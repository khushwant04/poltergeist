import { existsSync, readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { parseTrace } from "@poltergeist/core";
import type { Verdict } from "@poltergeist/oracles";
import { DivergenceError, LlmStub, ServerStub, cassetteOf, firstFrameDiff } from "@poltergeist/replay";
import { agentFromName } from "./agents/from-name.js";
import { llmRequestHash } from "./agents/reference.js";
import { loadRecordedRun } from "./recorded.js";
import { runScenario, type RunResult } from "./run.js";
import { scoreRecordedRun } from "./score-run.js";

export interface ReplayDivergence {
  kind: "llm" | "tool" | "frame";
  step: number;
  message: string;
  expected: unknown;
  actual: unknown;
}

export interface ReplayResult {
  mode: "env" | "full";
  originalRunId: string;
  run: RunResult;
  originalVerdicts: Verdict[];
  /** Full mode: true when every frame matched the recording. */
  equivalent: boolean | null;
  divergence: ReplayDivergence | null;
}

/**
 * Run a recorded run again.
 * - env: same scenario, seed, canaries and plan; the agent runs live.
 * - full: model answers come from the cassette and server answers from the trace, so only
 *   Poltergeist's own code runs for real and the result must match frame for frame.
 */
export async function replayRun(runId: string, opts: { mode: "env" | "full"; home?: string; force?: boolean; timeoutSec?: number }): Promise<ReplayResult> {
  const rec = loadRecordedRun(runId, opts);
  const original = await scoreRecordedRun(runId, opts.home !== undefined ? { home: opts.home } : {});
  const common = {
    loaded: rec.loaded,
    seed: rec.seed,
    trial: rec.trial,
    plan: rec.plan,
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.timeoutSec !== undefined ? { timeoutSec: opts.timeoutSec } : {}),
  };

  if (opts.mode === "env") {
    const run = await runScenario({ ...common, agent: agentFromName(rec.agent) });
    return { mode: "env", originalRunId: runId, run, originalVerdicts: original.verdicts, equivalent: null, divergence: null };
  }

  const llm = new LlmStub<Anthropic.MessageCreateParamsNonStreaming, Anthropic.Message>(cassetteOf(rec.lines), llmRequestHash);
  const stub = new ServerStub(rec.lines);
  const run = await runScenario({ ...common, agent: agentFromName(rec.agent, { createMessage: llm.create }), replay: { upstream: stub, worldDir: rec.worldDir } });
  const replayed = existsSync(run.tracePath) ? parseTrace(readFileSync(run.tracePath, "utf8")) : [];

  let divergence: ReplayDivergence | null = null;
  const fromError = (e: DivergenceError): ReplayDivergence => ({ kind: e.kind, step: e.step, message: e.message, expected: e.expected, actual: e.actual });
  if (llm.divergence) divergence = fromError(llm.divergence);
  else {
    const diff = firstFrameDiff(rec.lines, replayed);
    if (diff) {
      divergence = {
        kind: "frame",
        step: diff.index,
        message: stub.divergence ? stub.divergence.message : `frame ${diff.index} (seq ${diff.seq ?? "?"}) differs from the recording`,
        expected: diff.expected,
        actual: diff.actual,
      };
    } else if (stub.divergence) divergence = fromError(stub.divergence);
  }
  return { mode: "full", originalRunId: runId, run, originalVerdicts: original.verdicts, equivalent: divergence === null, divergence };
}
