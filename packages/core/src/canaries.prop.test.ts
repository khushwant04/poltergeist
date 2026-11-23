import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CANARY_PATTERN, deriveCanaries } from "./canaries.js";

describe("scenarios-and-oracles", () => {
  // Validates: Requirements 3.1, 3.2
  it("Property 1: canary derivation", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 16 }), (seed, count) => {
        const a = deriveCanaries(seed, count);
        expect(deriveCanaries(seed, count)).toEqual(a);
        expect(a).toHaveLength(count);
        expect(new Set(a).size).toBe(count);
        for (const c of a) expect(c).toMatch(CANARY_PATTERN);
      }),
      { numRuns: 200 },
    );
  });

  it("different seeds give different canaries", () => {
    expect(deriveCanaries(1, 1)).not.toEqual(deriveCanaries(2, 1));
  });
});
