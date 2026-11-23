import { join } from "node:path";
import type { LieJudge } from "@poltergeist/oracles";
import { loadRegressions } from "@poltergeist/replay";
import { agentFromName } from "./agents/from-name.js";
import type { AgentAdapter } from "./agents/types.js";
import { homeDir, runScenario, type RunResult } from "./run.js";
import { loadScenario } from "./scenarios.js";
import { Store } from "./store.js";

export interface RegressionOutcome {
  path: string;
  target: string;
  /** True when the target oracle passes now (the bug is fixed). */
  fixed: boolean;
  run: RunResult;
}

/** Run every saved regression case with its saved plan. */
export async function runRegressions(
  dir: string,
  opts: { agent?: AgentAdapter; home?: string; scenariosDir?: string; judge?: LieJudge | null; onRun?: (o: RegressionOutcome) => void } = {},
): Promise<RegressionOutcome[]> {
  const store = new Store(join(homeDir(opts.home), "poltergeist.db"));
  const out: RegressionOutcome[] = [];
  try {
    for (const { path, regression } of loadRegressions(dir)) {
      const agent = opts.agent ?? agentFromName(regression.agent ?? "fake");
      const run = await runScenario({
        loaded: loadScenario(regression.scenarioId, opts.scenariosDir),
        agent,
        seed: regression.seed,
        plan: regression.plan,
        store,
        judge: opts.judge ?? null,
        ...(opts.home !== undefined ? { home: opts.home } : {}),
      });
      const v = run.verdicts.find((x) => x.oracle === regression.target);
      const o = { path, target: regression.target, fixed: !v || !v.applicable || v.pass, run };
      out.push(o);
      opts.onRun?.(o);
    }
    return out;
  } finally {
    store.close();
  }
}
