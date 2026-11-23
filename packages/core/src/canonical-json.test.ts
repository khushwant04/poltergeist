import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import { hashOf } from "./hash.js";

const shuffleKeys = (v: unknown, rnd: () => number): unknown => {
  if (Array.isArray(v)) return v.map((x) => shuffleKeys(x, rnd));
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).sort(() => rnd() - 0.5);
    return Object.fromEntries(entries.map(([k, x]) => [k, shuffleKeys(x, rnd)]));
  }
  return v;
};

describe("canonical JSON", () => {
  it("sorts keys and drops undefined members", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}]},"b":1}');
  });

  it("is independent of key order", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.integer(), (v, seed) => {
        let s = seed;
        const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
        expect(hashOf(shuffleKeys(v, rnd))).toBe(hashOf(v));
      }),
    );
  });
});
