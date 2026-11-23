import { join, resolve } from "node:path";
import { PoltergeistError } from "@poltergeist/core";
import type { LieJudge, OracleId } from "@poltergeist/oracles";
import { saveRegression, shrinkPlan, type ShrinkEvent, type ShrinkResult, type TrialRunner } from "@poltergeist/replay";
import { agentFromName } from "./agents/from-name.js";
import { loadRecordedRun } from "./recorded.js";
import { homeDir, runScenario } from "./run.js";
import { scoreRecordedRun } from "./score-run.js";
import { Store } from "./store.js";

export interface ShrinkRunResult extends ShrinkResult {
  runId: string;
  scenarioId: string;
  regressionPath: string | null;
}

/** Shrink a recorded failure to the smallest plan that still fails `target`, using real trials. */
export async function shrinkRun(
  runId: string,
  opts: {
    target: OracleId;
    trials?: number;
    budget?: number;
    confirmTrials?: number;
    home?: string;
    force?: boolean;
    judge?: LieJudge | null;
    /** Directory for the regression file; null to skip saving. */
    regressionsDir?: string | null;
    onProgress?: (e: ShrinkEvent) => void;
  },
): Promise<ShrinkRunResult> {
  const rec = loadRecordedRun(runId, opts);
  const scored = await scoreRecordedRun(runId, { judge: opts.judge ?? null, ...(opts.home !== undefined ? { home: opts.home } : {}) });
  const target = scored.verdicts.find((v) => v.oracle === opts.target);
  if (!target || !target.applicable || target.pass) {
    throw new PoltergeistError("invalid_input", `run ${runId} did not fail ${opts.target}; nothing to shrink`, `Failing oracles: ${scored.verdicts.filter((v) => v.applicable && !v.pass).map((v) => v.oracle).join(", ") || "none"}`);
  }
  const store = new Store(join(homeDir(opts.home), "poltergeist.db"));
  const agent = agentFromName(rec.agent);
  const runner: TrialRunner = {
    async runTrial(plan) {
      const r = await runScenario({
        loaded: rec.loaded,
        agent,
        seed: rec.seed,
        plan,
        store,
        judge: opts.judge ?? null,
        ...(opts.home !== undefined ? { home: opts.home } : {}),
      });
      return { failed: new Set(r.verdicts.filter((v) => v.applicable && !v.pass).map((v) => v.oracle)), runId: r.runId };
    },
  };
  try {
    const result = await shrinkPlan(rec.plan, runner, {
      target: opts.target,
      ...(opts.trials !== undefined ? { trials: opts.trials } : {}),
      ...(opts.budget !== undefined ? { budget: opts.budget } : {}),
      ...(opts.confirmTrials !== undefined ? { confirmTrials: opts.confirmTrials } : {}),
      ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
    });
    let regressionPath: string | null = null;
    const dir = opts.regressionsDir === undefined ? resolve("scenarios/regressions") : opts.regressionsDir;
    if (dir !== null && result.status !== "flaky") {
      regressionPath = saveRegression(dir, {
        scenarioId: rec.loaded.scenario.id,
        seed: rec.seed,
        target: opts.target,
        plan: result.minimal,
        failureRate: result.failureRate,
        partial: result.status === "partial",
        agent: rec.agent,
        fromRunId: runId,
        createdAt: new Date().toISOString(),
      });
    }
    return { ...result, runId, scenarioId: rec.loaded.scenario.id, regressionPath };
  } finally {
    store.close();
  }
}
