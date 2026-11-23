import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, canonicalJson, type Plan } from "@poltergeist/core";
import { CATALOG, liar, whisper, possession } from "./catalog/index.js";
import { HauntingEngine } from "./engine.js";
import { contentArb, responseFrame, scenarioCtxArb } from "./test-arbitraries.js";
import type { AnyHaunting } from "./types.js";

const replacers: AnyHaunting[] = [whisper, possession, liar];

describe("haunting-engine", () => {
  // Validates: Requirements 3.2
  it("Property 10: plan order composition", () => {
    const caseArb = scenarioCtxArb.chain((ctx) => {
      const usable = replacers.map((h) => ({ h, arb: h.entry(ctx) })).filter((x) => x.arb !== null);
      if (usable.length === 0) return fc.constant(null);
      const pick = fc.constantFrom(...usable).chain(({ h, arb }) => arb!.map((e) => ({ h, e })));
      return fc.tuple(fc.constant(ctx), pick, pick, contentArb, fc.integer({ min: 1, max: 1000 }));
    });
    fc.assert(
      fc.property(caseArb, (c) => {
        if (c === null) return;
        const [ctx, a, b, content, n] = c;
        // Put both entries on the same target so they hit the same frame.
        const target = { method: "tools/call", toolName: ctx.scenario.lieTargets[0]?.tool ?? a.e.target.toolName!, occurrence: 1 };
        const plan: Plan = {
          version: 1,
          catalogVersion: CATALOG_VERSION,
          seed: 1,
          scenarioId: ctx.scenario.id,
          requires: [],
          entries: [
            { haunting: a.h.id, target, params: a.e.params },
            { haunting: b.h.id, target, params: b.e.params },
          ],
        };
        const frame = responseFrame(target.toolName, { content, structuredContent: { balance: n, date: "2026-11-05" } }, 1);
        const combined = new HauntingEngine(plan, ctx).onFrame(frame);

        const first = a.h.apply({ frame, params: a.e.params, ctx, state: undefined, entryIndex: 0 });
        const afterFirst = first.effect.kind === "replace" ? { ...frame, msg: first.effect.msg } : frame;
        const second = b.h.apply({ frame: afterFirst, params: b.e.params, ctx, state: undefined, entryIndex: 1 });
        const expectedMsg = second.effect.kind === "replace" ? second.effect.msg : afterFirst.msg;

        if (combined.kind === "forward") {
          expect(canonicalJson(expectedMsg)).toBe(canonicalJson(frame.msg));
        } else {
          expect(combined.kind).toBe("replace");
          expect(canonicalJson((combined as { msg: unknown }).msg)).toBe(canonicalJson(expectedMsg));
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("HauntingEngine", () => {
  it("rejects unknown hauntings and plans from another catalog version", () => {
    const ctx = { scenario: { id: "x" } } as never;
    const base: Plan = { version: 1, catalogVersion: CATALOG.version, seed: 1, scenarioId: "x", entries: [], requires: [] };
    expect(() => new HauntingEngine({ ...base, entries: [{ haunting: "nope", target: { method: "tools/call", occurrence: 1 }, params: {} }] }, ctx)).toThrow(/unknown haunting/);
    expect(() => new HauntingEngine({ ...base, catalogVersion: "999" }, ctx)).toThrow(/catalog version/);
  });
});
