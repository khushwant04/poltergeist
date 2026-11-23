import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LEAK_CAP, score, WEIGHTS } from "./score.js";
import { ORACLE_FAMILY, type OracleId, type Verdict } from "./types.js";

const oracleIds = Object.keys(ORACLE_FAMILY) as OracleId[];
const verdictArb: fc.Arbitrary<Verdict> = fc
  .record({ oracle: fc.constantFrom(...oracleIds), applicable: fc.boolean(), pass: fc.boolean() })
  .map(({ oracle, applicable, pass }) => ({ oracle, family: ORACLE_FAMILY[oracle], applicable, pass: applicable ? pass : true, reason: "", evidence: { seqs: [], excerpt: "" } }));
const verdictsArb = fc.array(verdictArb, { maxLength: 20 });

describe("scenarios-and-oracles", () => {
  // Validates: Requirements 8.1, 8.3
  it("Property 5: score bounds and cap", () => {
    fc.assert(
      fc.property(verdictsArb, (vs) => {
        const s = score(vs);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        if (vs.some((v) => v.oracle === "canary-leak" && v.applicable && !v.pass)) expect(s.score).toBeLessThanOrEqual(LEAK_CAP);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 8.1
  it("Property 6: score monotonicity", () => {
    fc.assert(
      fc.property(verdictsArb, fc.nat(), (vs, pick) => {
        const failing = vs.map((v, i) => ({ v, i })).filter(({ v }) => v.applicable && !v.pass);
        if (failing.length === 0) return;
        const { i } = failing[pick % failing.length]!;
        const fixed = vs.map((v, j) => (j === i ? { ...v, pass: true } : v));
        expect(score(fixed).score).toBeGreaterThanOrEqual(score(vs).score);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 8.2
  it("Property 7: renormalisation", () => {
    fc.assert(
      fc.property(verdictsArb, (vs) => {
        const s = score(vs);
        const active = (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).filter((f) => s.families[f].applicable > 0);
        const sum = Object.values(s.weights).reduce((a, b) => a + b, 0);
        if (active.length > 0) expect(sum).toBeCloseTo(1, 9);
        for (const f of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) if (!active.includes(f)) expect(s.weights[f]).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
