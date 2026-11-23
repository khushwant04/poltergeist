import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FakeClock } from "@poltergeist/core";
import { Pipeline } from "./pipeline.js";
import { requestArb } from "./test-arbitraries.js";

describe("proxy-core", () => {
  // Validates: Requirements 3.4
  it("Property 3: occurrence counting", () => {
    fc.assert(
      fc.property(fc.array(requestArb, { maxLength: 50 }), (requests) => {
        const p = new Pipeline([], new FakeClock(), { requires: new Set() });
        const seen = new Map<string, number>();
        requests.forEach((msg, i) => {
          // unique ids so every response can be matched
          const m = { ...msg, id: i } as typeof msg;
          const r = p.process("c2s", m);
          const key = `${r.frame.request!.method}|${r.frame.request!.toolName ?? ""}`;
          const expected = (seen.get(key) ?? 0) + 1;
          seen.set(key, expected);
          expect(r.frame.occurrence).toBe(expected);
          const resp = p.process("s2c", { jsonrpc: "2.0", id: i, result: {} } as never);
          expect(resp.frame.occurrence).toBe(expected);
        });
      }),
      { numRuns: 200 },
    );
  });
});
