import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ORACLE_FAMILY, type OracleId, type Verdict } from "@poltergeist/oracles";
import { toJUnit, type JUnitRun } from "./junit.js";
import { gate } from "./gate.js";

const oracleIds = Object.keys(ORACLE_FAMILY) as OracleId[];
const verdictArb: fc.Arbitrary<Verdict> = fc
  .record({ oracle: fc.constantFrom(...oracleIds), applicable: fc.boolean(), pass: fc.boolean(), reason: fc.string({ maxLength: 40 }), excerpt: fc.string({ maxLength: 60 }) })
  .map(({ oracle, applicable, pass, reason, excerpt }) => ({ oracle, family: ORACLE_FAMILY[oracle], applicable, pass: applicable ? pass : true, reason, evidence: { seqs: [1, 2], excerpt } }));
const runArb: fc.Arbitrary<JUnitRun> = fc.record({
  runId: fc.stringMatching(/^[0-9A-Z]{6}$/),
  scenarioId: fc.stringMatching(/^[a-z-]{1,12}$/),
  seed: fc.nat(),
  trial: fc.integer({ min: 1, max: 3 }),
  agent: fc.string({ maxLength: 20 }),
  verdicts: fc.array(verdictArb, { maxLength: 8 }),
});

/** A minimal well-formedness check: every tag closes, attribute values contain no raw < or ". */
function wellFormed(xml: string): boolean {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z]+)((?:\s+[a-z]+="[^"<]*")*)\s*(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  const textOnly = body.replace(/<[^>]*>/g, "");
  return stack.length === 0 && !textOnly.includes("<") && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(textOnly);
}

describe("scenarios-and-oracles", () => {
  // Validates: Requirements 9.2
  it("Property 10: JUnit matches verdicts", () => {
    fc.assert(
      fc.property(fc.array(runArb, { maxLength: 6 }), (runs) => {
        const xml = toJUnit("suite & <co>", runs);
        const applicable = runs.flatMap((r) => r.verdicts.filter((v) => v.applicable));
        const failing = applicable.filter((v) => !v.pass);
        expect(wellFormed(xml)).toBe(true);
        expect((xml.match(/<testcase /g) ?? []).length).toBe(applicable.length);
        expect((xml.match(/<failure /g) ?? []).length).toBe(failing.length);
        expect(xml).toContain(`<testsuites tests="${applicable.length}" failures="${failing.length}">`);
      }),
      { numRuns: 200 },
    );
  });

  it("the CI gate fails on a low score or a large drop", () => {
    expect(gate({ score: 80, minScore: 90 }).pass).toBe(false);
    expect(gate({ score: 80, maxDrop: 5, baseline: 90 }).pass).toBe(false);
    expect(gate({ score: 88, maxDrop: 5, baseline: 90 }).pass).toBe(true);
    expect(gate({ score: 80 }).pass).toBe(true);
  });
});
