/**
 * Records the runs shown in the hosted Séance Room demo and exports them to demo/bundles.
 * Uses the deterministic fake agents, so it needs no API key:  pnpm demo:record
 */
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { CATALOG_VERSION, type Plan } from "@poltergeist/core";
import { exportBundles, fakeAgent, loadScenario, runScenario, shrinkRun, type RunResult } from "@poltergeist/runner";

const home = resolve("demo/.home");
const regressions = resolve("demo/regressions");
rmSync(home, { recursive: true, force: true });
rmSync(regressions, { recursive: true, force: true });
rmSync(resolve("demo/bundles"), { recursive: true, force: true });

const careful = fakeAgent();
const gullible = fakeAgent({ fallFor: ["possession", "whisper"] });
const scenarios = ["inbox-summary", "pay-the-invoice", "plan-my-week"];
const failures: RunResult[] = [];
const shown: string[] = [];

for (const id of scenarios) {
  const loaded = loadScenario(id);
  for (const seed of [1, 2, 3]) {
    for (const agent of [careful, gullible]) {
      const r = await runScenario({ loaded, agent, seed, home });
      process.stderr.write(`${id} seed ${seed} ${agent.name}: ${r.score.score}\n`);
      shown.push(r.runId);
      if (r.verdicts.some((v) => v.oracle === "canary-leak" && v.applicable && !v.pass)) failures.push(r);
    }
  }
}

// The error that lied: the transfer went through, the agent was told it failed, and a retry paid twice.
const doublePay: Plan = {
  version: 1,
  catalogVersion: CATALOG_VERSION,
  seed: 8,
  scenarioId: "pay-the-invoice",
  requires: [],
  entries: [{ haunting: "error-storm", target: { method: "tools/call", toolName: "transfer_funds", occurrence: 1 }, params: { k: 1, style: "isError" } }],
};
const dp = await runScenario({ loaded: loadScenario("pay-the-invoice"), agent: fakeAgent({ retries: 2 }), seed: 8, plan: doublePay, home });
process.stderr.write(`double payment: ${dp.score.score}\n`);
shown.push(dp.runId);

// Shrink the leaks down to their cause.
for (const f of failures.slice(0, 2)) {
  const s = await shrinkRun(f.runId, { target: "canary-leak", home, regressionsDir: regressions, trials: 1 });
  process.stderr.write(`shrunk ${f.scenarioId} seed ${f.seed}: ${s.original.entries.length} → ${s.minimal.entries.length}\n`);
}

// Only the runs above; the shrinker's own trial runs stay out of the demo.
const index = await exportBundles(resolve("demo"), shown, { home, regressionsDir: regressions });
process.stderr.write(`exported ${index.runs.length} runs to demo/bundles\n`);
