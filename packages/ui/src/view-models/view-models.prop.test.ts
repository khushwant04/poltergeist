import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BundleFrame } from "@poltergeist/core";
import { agentLabel, oracleLabel } from "./labels.js";
import { applyDiff, foldDiff, messageDiff, prettyLines } from "./message-diff.js";
import { toTimelineRows } from "./timeline.js";

const msgArb = fc.oneof(
  fc.record({ jsonrpc: fc.constant("2.0"), id: fc.nat(), method: fc.constantFrom("tools/call", "tools/list"), params: fc.record({ name: fc.string(), arguments: fc.jsonValue() }) }),
  fc.record({ jsonrpc: fc.constant("2.0"), id: fc.nat(), result: fc.record({ content: fc.array(fc.record({ type: fc.constant("text"), text: fc.string() })) }) }),
);
const frameArb: fc.Arbitrary<BundleFrame> = fc
  .record({
    dir: fc.constantFrom<"c2s" | "s2c">("c2s", "s2c"),
    msg: msgArb,
    haunted: fc.option(fc.record({ entryIndex: fc.integer({ min: -1, max: 5 }), haunting: fc.constantFrom("whisper", "possession", "vanish", "liar") }), { nil: undefined }),
    delivery: fc.constantFrom("sent", "delayed", "dropped", "held"),
  })
  .map(({ dir, msg, haunted, delivery }) => ({ seq: 0, dir, t: 0, msg: msg as never, delivery, ...(haunted ? { cause: haunted } : {}) }) as BundleFrame);

describe("seance-room-and-integrations", () => {
  // Validates: Requirements 2.2
  it("Property 3: timeline order", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 10_000 }), { maxLength: 60 }), fc.array(frameArb, { maxLength: 60 }), (seqs, frames) => {
        const withSeq = frames.slice(0, seqs.length).map((f, i) => ({ ...f, seq: seqs[i]! }));
        const rows = toTimelineRows({ frames: withSeq });
        expect(rows).toHaveLength(withSeq.length);
        for (let i = 1; i < rows.length; i++) expect(rows[i]!.seq).toBeGreaterThan(rows[i - 1]!.seq);
        for (const r of rows) expect(r.haunting !== undefined).toBe(r.frame.cause !== undefined);
      }),
      { numRuns: 200 },
    );
  });

  // Validates: Requirements 2.3
  it("Property 4: message diff is faithful", () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 4 }), fc.jsonValue({ maxDepth: 4 }), (a, b) => {
        const ops = messageDiff(a, b);
        expect(applyDiff(ops, "after")).toEqual(prettyLines(b));
        expect(applyDiff(ops, "before")).toEqual(prettyLines(a));
        // Folding never hides a change.
        const shown = foldDiff(ops).flatMap((g) => (g.kind === "lines" ? g.ops : []));
        expect(shown.filter((o) => o.op !== "eq")).toEqual(ops.filter((o) => o.op !== "eq"));
      }),
      { numRuns: 200 },
    );
  });
});

describe("labels", () => {
  it("every failing check has failure wording, and agents get friendly names", () => {
    for (const id of ["canary-leak", "forbidden-call", "injection-obedience", "task-completed", "recovered", "spotted-the-lie"]) {
      expect(oracleLabel(id).failed).not.toBe(oracleLabel(id).plain);
    }
    expect(agentLabel("fake(falls-for:possession+whisper)")).toEqual({ name: "Scripted, gullible", detail: "falls for possession, whisper" });
    expect(agentLabel("reference(hardened)").detail).toBe("hardened prompt");
  });

  it("tool results that hold JSON or multi-line text are expanded for reading", () => {
    const lines = prettyLines({ text: '{"emails":[{"id":"e1"}]}', note: "a\nb" });
    expect(lines.join("\n")).toContain('"id": "e1"');
    expect(lines).toContain('    "a",');
  });
});
