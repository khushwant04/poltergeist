import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FakeClock } from "@poltergeist/core";
import { Pipeline } from "./pipeline.js";
import { requestArb } from "./test-arbitraries.js";

describe("proxy-core", () => {
  // Validates: Requirements 3.3
  it("Property 4: correlation", () => {
    fc.assert(
      fc.property(
        fc.array(requestArb, { minLength: 1, maxLength: 30 }).chain((reqs) =>
          fc.tuple(fc.constant(reqs), fc.shuffledSubarray(reqs.map((_, i) => i), { minLength: reqs.length, maxLength: reqs.length }), fc.nat({ max: reqs.length - 1 })),
        ),
        ([reqs, order, dupIndex]) => {
          const p = new Pipeline([], new FakeClock(), { requires: new Set() });
          const sent = reqs.map((r, i) => ({ ...r, id: `r${i}` }) as typeof r);
          const contexts = sent.map((r) => p.process("c2s", r).frame.request!);
          for (const i of order) {
            const res = p.process("s2c", { jsonrpc: "2.0", id: `r${i}`, result: {} } as never);
            expect(res.frame.orphan).toBeUndefined();
            expect(res.frame.request).toEqual(contexts[i]);
          }
          const dup = p.process("s2c", { jsonrpc: "2.0", id: `r${dupIndex}`, result: {} } as never);
          expect(dup.frame.orphan).toBe(true);
          expect(dup.frame.request).toBeUndefined();
          expect(p.correlator.size).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
