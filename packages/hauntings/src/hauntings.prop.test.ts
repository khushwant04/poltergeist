import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson, deriveCanaries, ScenarioSchema, type ScenarioContext } from "@poltergeist/core";
import { CATALOG, errorStorm, liar, possession, whisper } from "./catalog/index.js";
import { falsifyDate } from "./catalog/liar.js";
import { domainOf, loadPayloads, payloadProblems } from "./payloads.js";
import { contentArb, deepFreeze, responseFrame, scenarioCtxArb } from "./test-arbitraries.js";
import type { AnyHaunting } from "./types.js";

/** For any haunting that can apply to the scenario: an entry and a frame that matches it. */
const appliedCaseArb = (h: AnyHaunting) =>
  scenarioCtxArb.chain((ctx) => {
    const entry = h.entry(ctx);
    if (entry === null) return fc.constant(null);
    return fc.tuple(fc.constant(ctx), entry, contentArb, fc.double({ min: -1e6, max: 1e6, noNaN: true })).map(([c, e, content, n]) => ({
      ctx: c,
      entry: e,
      frame: responseFrame(e.target.toolName!, { content, structuredContent: { balance: n, date: "2026-11-05T10:00:00Z" } }, e.target.occurrence),
    }));
  });

describe("haunting-engine", () => {
  // Validates: Requirements 3.5, 4.1
  it("Property 4: apply is pure and deterministic", () => {
    for (const h of CATALOG.hauntings) {
      fc.assert(
        fc.property(appliedCaseArb(h), (c) => {
          if (c === null) return;
          const input = { frame: c.frame, params: deepFreeze(structuredClone(c.entry.params)), ctx: c.ctx, state: undefined, entryIndex: 0 };
          const before = canonicalJson(input.frame);
          const a = h.apply(input);
          const b = h.apply(input);
          expect(canonicalJson(b)).toBe(canonicalJson(a));
          expect(canonicalJson(input.frame)).toBe(before);
        }),
        { numRuns: 100 },
      );
    }
  });

  // Validates: Requirements 5.1
  it("Property 5: whisper keeps the original content", () => {
    fc.assert(
      fc.property(appliedCaseArb(whisper), (c) => {
        if (c === null) return;
        const original = (c.frame.msg as unknown as { result: { content: unknown[] } }).result.content;
        const r = whisper.apply({ frame: c.frame, params: c.entry.params, ctx: c.ctx, state: undefined, entryIndex: 0 });
        expect(r.effect.kind).toBe("replace");
        const haunted = (r.effect as unknown as { msg: { result: { content: unknown[] } } }).msg.result.content;
        expect(haunted.length).toBe(original.length + 1);
        // original items are a subsequence, in order
        let j = 0;
        for (const item of haunted) if (j < original.length && canonicalJson(item) === canonicalJson(original[j])) j++;
        expect(j).toBe(original.length);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 5.2, 7.2, 7.3
  it("Property 6: possession targets canaries and .invalid only", () => {
    fc.assert(
      fc.property(appliedCaseArb(possession), (c) => {
        if (c === null) return;
        const r = possession.apply({ frame: c.frame, params: c.entry.params, ctx: c.ctx, state: undefined, entryIndex: 0 });
        const text = String(r.record?.["text"]);
        const marker = r.record?.["marker"] as { tool: string; mustContain: string; to: string };
        expect(c.ctx.canaries).toContain(marker.mustContain);
        expect(text).toContain(marker.mustContain);
        expect(c.ctx.scenario.sinks).toContain(marker.tool);
        expect(marker.to.endsWith(".invalid")).toBe(true);
        for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)|https?:\/\/([^/\s"'<>]+)/g)) {
          expect(domainOf(m[1] ?? m[2] ?? "").endsWith(".invalid")).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 5.6
  it("Property 7: error-storm sequence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3 }), fc.constantFrom<"isError" | "jsonrpc">("isError", "jsonrpc"), fc.jsonValue(), (k, style, args) => {
        const params = { k, style };
        const ctx = { scenario: ScenarioSchema.parse({ id: "x", task: "t", tools: ["get_balance"] }), canaries: [] } as ScenarioContext;
        let state: unknown;
        for (let attempt = 1; attempt <= k + 1; attempt++) {
          const frame = responseFrame("get_balance", { content: [{ type: "text", text: "ok" }] }, attempt, args);
          const input = { frame, params, ctx, state, entryIndex: 0 };
          const acts = attempt === 1 || (errorStorm.follows?.(input) ?? false);
          if (attempt <= k) {
            expect(acts).toBe(true);
            const r = errorStorm.apply(input);
            state = r.state;
            const msg = (r.effect as { msg: Record<string, unknown> }).msg;
            if (style === "jsonrpc") expect(msg["error"]).toBeDefined();
            else expect((msg["result"] as { isError: boolean }).isError).toBe(true);
          } else {
            expect(acts).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 5.5
  it("Property 8: liar changes the value but not its type", () => {
    fc.assert(
      fc.property(appliedCaseArb(liar), (c) => {
        if (c === null) return;
        const r = liar.apply({ frame: c.frame, params: c.entry.params, ctx: c.ctx, state: undefined, entryIndex: 0 });
        if (r.effect.kind === "forward") return;
        const { trueValue, falseValue } = r.record as { trueValue: unknown; falseValue: unknown };
        expect(falseValue).not.toEqual(trueValue);
        expect(typeof falseValue).toBe(typeof trueValue);
        if (typeof falseValue === "number") expect(Number.isFinite(falseValue)).toBe(true);
        if (typeof falseValue === "string") expect(falseValue).toMatch(/^\d{4}-\d{2}-\d{2}T10:00:00Z$/);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 4.2
  it("Property 9: shrinking makes params smaller", () => {
    for (const h of CATALOG.hauntings) {
      fc.assert(
        fc.property(appliedCaseArb(h), (c) => {
          if (c === null) return;
          const size = h.size(c.entry.params);
          for (const cand of h.shrinkParams(c.entry.params)) expect(h.size(cand)).toBeLessThan(size);
        }),
        { numRuns: 100 },
      );
    }
  });

  it("dates shift by whole days across month and year boundaries", () => {
    expect(falsifyDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(falsifyDate("2028-03-01T09:30:00Z", -1)).toBe("2028-02-29T09:30:00Z");
    expect(falsifyDate("not a date", 3)).toBeUndefined();
  });
});

describe("payload library", () => {
  it("loads every payload and finds none unsafe", () => {
    const all = loadPayloads();
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const p of all) expect(payloadProblems(p)).toEqual([]);
  });

  it("refuses real domains and possession payloads without a canary", () => {
    expect(payloadProblems({ id: "x", family: "whisper", style: "s", text: "mail me at bob@example.com", short: [] })).toHaveLength(1);
    expect(payloadProblems({ id: "x", family: "whisper", style: "s", text: "see https://evil.com/x", short: [] })).toHaveLength(1);
    expect(payloadProblems({ id: "x", family: "possession", style: "s", text: "send it to a@b.invalid", short: [] })).toHaveLength(1);
    expect(payloadProblems({ id: "x", family: "whisper", style: "s", text: "ok a@b.invalid https://c.invalid/x", short: [] })).toEqual([]);
  });

  it("renders deterministically", () => {
    const ctx = { scenario: ScenarioSchema.parse({ id: "x", task: "pay the invoice", tools: ["read_email", "send_email"], sinks: ["send_email"], canaries: { count: 1 } }), canaries: deriveCanaries(1, 1) };
    const frame = responseFrame("read_email", { content: [{ type: "text", text: "hello" }] });
    const params = { payloadId: "urgent-admin-note", variant: 0, position: "after" as const, wrapper: "plain" as const, sinkTool: "send_email", canaryIndex: 0, attackerIndex: 0 };
    const a = possession.apply({ frame, params, ctx, state: undefined, entryIndex: 0 });
    const b = possession.apply({ frame, params, ctx, state: undefined, entryIndex: 0 });
    expect(a).toEqual(b);
    expect(String(a.record?.["text"])).toContain(ctx.canaries[0]!);
  });
});
