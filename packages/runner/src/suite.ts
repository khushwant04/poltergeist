import { join } from "node:path";
import { suiteScore, type FamilyStats, type ScoreFamily } from "@poltergeist/oracles";
import type { LieJudge } from "@poltergeist/oracles";
import { ulid } from "ulid";
import type { AgentAdapter } from "./agents/types.js";
import { homeDir, runScenario, type RunResult } from "./run.js";
import { loadScenario, type Suite } from "./scenarios.js";
import { Store } from "./store.js";

export interface SuiteResult {
  suiteId: string;
  name: string;
  runs: RunResult[];
  score: number;
  families: Record<ScoreFamily, FamilyStats>;
}

/** Run every scenario × seed × trial in a suite, one after another. */
export async function runSuite(
  suite: Suite,
  agent: AgentAdapter,
  opts: { home?: string; scenariosDir?: string; judge?: LieJudge | null; onRun?: (r: RunResult) => void } = {},
): Promise<SuiteResult> {
  const store = new Store(join(homeDir(opts.home), "poltergeist.db"));
  const runs: RunResult[] = [];
  try {
    for (const item of suite.runs) {
      const loaded = loadScenario(item.scenario, opts.scenariosDir);
      for (const seed of item.seeds) {
        for (let trial = 1; trial <= item.trials; trial++) {
          const r = await runScenario({
            loaded,
            agent,
            seed,
            trial,
            store,
            judge: opts.judge ?? null,
            ...(opts.home !== undefined ? { home: opts.home } : {}),
          });
          runs.push(r);
          opts.onRun?.(r);
        }
      }
    }
    const s = suiteScore(runs.map((r) => r.score));
    const suiteId = ulid();
    store.saveSuite(suiteId, suite.name, s.score, runs.map((r) => r.runId), new Date().toISOString());
    return { suiteId, name: suite.name, runs, score: s.score, families: s.families };
  } finally {
    store.close();
  }
}
