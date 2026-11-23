import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PlanSchema, hashOf } from "@poltergeist/core";
import { CATALOG } from "./catalog/index.js";
import { generatePlan, planHash } from "./plan.js";
import { scenarioCtxArb } from "./test-arbitraries.js";

const seedArb = fc.integer({ min: 0, max: 0xffffffff });

describe("haunting-engine", () => {
  // Validates: Requirements 1.1, 1.2
  it("Property 1: seed determinism", () => {
    fc.assert(
      fc.property(seedArb, scenarioCtxArb, (seed, ctx) => {
        const a = generatePlan(seed, ctx);
        const b = generatePlan(seed, ctx);
        expect(b).toEqual(a);
        expect(planHash(b)).toBe(planHash(a));
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 1.3, 1.4, 2.1
  it("Property 2: plan validity", () => {
    fc.assert(
      fc.property(seedArb, scenarioCtxArb, (seed, ctx) => {
        const plan = generatePlan(seed, ctx);
        expect(PlanSchema.safeParse(plan).success).toBe(true);
        expect(plan.entries.length).toBeLessThanOrEqual(ctx.scenario.hauntings.maxPerRun);
        const allow = ctx.scenario.hauntings.allow;
        for (const e of plan.entries) {
          if (allow.length > 0) expect(allow).toContain(e.haunting);
          expect(CATALOG.byId.has(e.haunting)).toBe(true);
          expect(ctx.scenario.tools).toContain(e.target.toolName);
          expect(e.target.occurrence).toBeLessThanOrEqual(ctx.scenario.hauntings.maxOccurrence);
        }
        const needsListChanged = plan.entries.some((e) => e.haunting === "rug-pull");
        expect(plan.requires.includes("tools.listChanged")).toBe(needsListChanged);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 2.2
  it("Property 3: hash stability", () => {
    fc.assert(
      fc.property(seedArb, scenarioCtxArb, (seed, ctx) => {
        const plan = generatePlan(seed, ctx);
        const reordered = JSON.parse(JSON.stringify(plan, Object.keys(plan).reverse()));
        const rebuilt = Object.fromEntries(Object.entries(plan).reverse());
        expect(hashOf(rebuilt)).toBe(planHash(plan));
        expect(typeof reordered).toBe("object");
      }),
      { numRuns: 200 },
    );
  });
});
