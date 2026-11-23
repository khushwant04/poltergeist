import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, type Plan, type PlanEntry } from "@poltergeist/core";
import { CATALOG, generatePlan } from "@poltergeist/hauntings";
import { scenarioCtxArb } from "../../hauntings/src/test-arbitraries.js";
import { loadRegression, saveRegression } from "./regression.js";
import { isSubsetPlan, shrinkPlan, type TrialRunner } from "./shrink.js";

const TARGET = "canary-leak";
const key = (e: PlanEntry) => `${e.haunting}|${e.target.toolName}|${e.target.occurrence}`;

/** Plans with several distinct entries, from real hauntings so params can shrink. */
const planArb: fc.Arbitrary<Plan> = fc
  .tuple(scenarioCtxArb, fc.integer({ min: 0, max: 0xffffffff }))
  .map(([ctx, seed]) => {
    const scenario = { ...ctx.scenario, hauntings: { ...ctx.scenario.hauntings, maxPerRun: 8, allow: [] } };
    return generatePlan(seed, { ...ctx, scenario }, CATALOG);
  })
  .filter((p) => p.entries.length >= 2 && new Set(p.entries.map(key)).size === p.entries.length);

/** Fails deterministically when the plan contains every entry in `culprits` (by haunting and target). */
function deterministicRunner(culprits: ReadonlySet<string>) {
  let calls = 0;
  const runner: TrialRunner = {
    async runTrial(plan) {
      calls++;
      const keys = new Set(plan.entries.map(key));
      return { failed: new Set([...culprits].every((c) => keys.has(c)) ? [TARGET] : []) };
    },
  };
  return { runner, calls: () => calls };
}

const culpritsArb = (p: Plan) => fc.subarray(p.entries.map(key), { minLength: 1, maxLength: Math.min(3, p.entries.length) }).map((xs) => new Set(xs));
const caseArb = planArb.chain((p) => fc.tuple(fc.constant(p), culpritsArb(p)));

describe("replay-and-shrink", () => {
  // Validates: Requirements 4.2
  it("Property 3: shrinking keeps a subset", async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async ([plan, culprits]) => {
        const r = await shrinkPlan(plan, deterministicRunner(culprits).runner, { target: TARGET, trials: 1, budget: 500, confirmTrials: 1 });
        expect(isSubsetPlan(r.minimal, plan)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 4.2
  it("Property 4: shrinking never grows", async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async ([plan, culprits]) => {
        const r = await shrinkPlan(plan, deterministicRunner(culprits).runner, { target: TARGET, trials: 1, budget: 500, confirmTrials: 1 });
        expect(r.minimal.entries.length).toBeLessThanOrEqual(plan.entries.length);
        for (const e of r.minimal.entries) {
          const orig = plan.entries.find((o) => key(o) === key(e))!;
          const h = CATALOG.byId.get(e.haunting)!;
          expect(h.size(e.params)).toBeLessThanOrEqual(h.size(orig.params));
        }
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 4.2
  it("Property 5: 1-minimality for deterministic failures", async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async ([plan, culprits]) => {
        const { runner } = deterministicRunner(culprits);
        const r = await shrinkPlan(plan, runner, { target: TARGET, trials: 1, budget: 1000, confirmTrials: 1 });
        expect(r.status).toBe("minimal");
        expect(r.failureRate).toBe(1);
        // With an "all culprits present" failure, the minimal plan is exactly the culprits.
        expect(new Set(r.minimal.entries.map(key))).toEqual(culprits);
        for (let i = 0; i < r.minimal.entries.length; i++) {
          const without = { ...r.minimal, entries: r.minimal.entries.filter((_, j) => j !== i) };
          expect((await runner.runTrial(without)).failed.has(TARGET)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 4.3, 4.4
  it("Property 6: budget is respected", async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 5 }), async ([plan, culprits], budget, trials, confirmTrials) => {
        const { runner, calls } = deterministicRunner(culprits);
        const r = await shrinkPlan(plan, runner, { target: TARGET, trials, budget, confirmTrials });
        expect(r.trialsUsed).toBeLessThanOrEqual(budget);
        const confirmUsed = r.status === "flaky" || (r.status === "partial" && r.confirmTrials === 0) ? 0 : confirmTrials;
        expect(calls()).toBe(r.trialsUsed + confirmUsed);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 4.1
  it("Property 7: majority vote", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 9 }), async (outcomes) => {
        // A flaky runner that returns this fixed sequence of outcomes for the repro check.
        const k = outcomes.length;
        let i = 0;
        const runner: TrialRunner = { runTrial: async () => ({ failed: new Set(outcomes[i++ % k] ? [TARGET] : []) }) };
        const plan: Plan = { version: 1, catalogVersion: CATALOG_VERSION, seed: 1, scenarioId: "x", requires: [], entries: [] };
        const r = await shrinkPlan(plan, runner, { target: TARGET, trials: k, budget: 100, confirmTrials: 0 });
        const failures = outcomes.filter(Boolean).length;
        expect(r.status === "flaky").toBe(failures < Math.ceil(k / 2));
      }),
      { numRuns: 300 },
    );
  });

  // Validates: Requirements 5.1
  it("Property 8: regression round trip", () => {
    const dir = mkdtempSync(join(tmpdir(), "pg-reg-"));
    fc.assert(
      fc.property(planArb, fc.double({ min: 0, max: 1, noNaN: true }), fc.boolean(), (plan, failureRate, partial) => {
        const r = { scenarioId: plan.scenarioId, seed: plan.seed, target: TARGET, plan, failureRate, partial, agent: "fake", createdAt: "2026-11-23T00:00:00.000Z" };
        const loaded = loadRegression(saveRegression(dir, r));
        expect(loaded).toEqual(r);
      }),
      { numRuns: 100 },
    );
  });
});
