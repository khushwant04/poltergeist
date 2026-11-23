import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FakeClock, canonicalJson, type Interceptor } from "@poltergeist/core";
import { Pipeline, type PipelineEvent } from "./pipeline.js";
import { trafficArb, anyMessageArb } from "./test-arbitraries.js";

describe("proxy-core", () => {
  // Validates: Requirements 3.2
  it("Property 2: sequence numbers", () => {
    fc.assert(
      fc.property(trafficArb, (traffic) => {
        const p = new Pipeline([], new FakeClock(), { requires: new Set() });
        const seqs = traffic.map(({ dir, msg }) => p.process(dir, msg).frame.seq);
        for (let i = 1; i < seqs.length; i++) expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
        expect(new Set(seqs).size).toBe(seqs.length);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 3.5
  it("Property 7: interceptor failure isolation", () => {
    const thrower: Interceptor = {
      name: "thrower",
      onFrame: () => {
        throw new Error("boom");
      },
    };
    fc.assert(
      fc.property(anyMessageArb, fc.constantFrom("c2s" as const, "s2c" as const), (msg, dir) => {
        const events: PipelineEvent[] = [];
        const p = new Pipeline([thrower], new FakeClock(), { requires: new Set() }, (e) => events.push(e));
        const before = canonicalJson(msg);
        const r = p.process(dir, msg);
        expect(r.effect.kind).toBe("forward");
        expect(canonicalJson(r.frame.msg)).toBe(before);
        expect(r.original).toBeUndefined();
        expect(events).toHaveLength(1);
        expect(events[0]!.name).toBe("interceptor_error");
      }),
      { numRuns: 200 },
    );
  });

  it("interceptors cannot mutate the message they are given", () => {
    const mutator: Interceptor = {
      name: "mutator",
      onFrame: (frame) => {
        (frame.msg as unknown as Record<string, unknown>)["jsonrpc"] = "1.0";
        return { kind: "forward" };
      },
    };
    const events: PipelineEvent[] = [];
    const p = new Pipeline([mutator], new FakeClock(), { requires: new Set() }, (e) => events.push(e));
    const r = p.process("c2s", { jsonrpc: "2.0", id: 1, method: "ping" } as never);
    expect((r.frame.msg as unknown as { jsonrpc: string }).jsonrpc).toBe("2.0");
    expect(events[0]?.name).toBe("interceptor_error");
  });
});
