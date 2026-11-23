import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { FakeClock, canonicalJson, parseTrace } from "@poltergeist/core";
import { Proxy } from "./proxy.js";
import { FileTraceSink, REDACTED, redactValue } from "./recorder.js";
import { CaptureTransport, trafficArb } from "./test-arbitraries.js";

const dir = mkdtempSync(join(tmpdir(), "pg-trace-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const canaryArb = fc
  .tuple(fc.stringMatching(/^[0-9A-HJKMNP-TV-Z]{6}$/), fc.stringMatching(/^[0-9A-HJKMNP-TV-Z]{6}$/))
  .map(([a, b]) => `PG-${a}-${b}`);
const secretArb = fc.stringMatching(/^[a-z]{8,16}$/).filter((s) => !REDACTED.includes(s));

describe("proxy-core", () => {
  // Validates: Requirements 4.1, 4.2, 4.3
  it("Property 5: trace round trip", async () => {
    let n = 0;
    await fc.assert(
      fc.asyncProperty(trafficArb, async (traffic) => {
        const path = join(dir, `run-${n++}.jsonl`);
        const agent = new CaptureTransport();
        const upstream = new CaptureTransport();
        const proxy = new Proxy({ agent, upstream, clock: new FakeClock(), sink: new FileTraceSink(path) });
        await proxy.start();
        for (const { dir: d, msg } of traffic) proxy.handle(d, msg);
        proxy.closeTrace();
        const lines = parseTrace(readFileSync(path, "utf8"));
        expect(lines[0]?.type).toBe("header");
        const frames = lines.filter((l) => l.type === "frame");
        expect(frames.map((f) => canonicalJson(f.msg))).toEqual(traffic.map((t) => canonicalJson(t.msg)));
        expect(frames.map((f) => f.dir)).toEqual(traffic.map((t) => t.dir));
        expect(frames.every((f) => f.delivery === "sent")).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Validates: Requirements 4.4
  it("Property 6: redaction", () => {
    fc.assert(
      fc.property(secretArb, canaryArb, fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), (secret, canary, pre, post) => {
        const msg = {
          type: "frame",
          text: `${pre}${secret}${post}`,
          nested: [{ value: `token=${secret}` }, `canary ${canary} here`],
        };
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const out = JSON.stringify(
          redactValue(msg, {
            patterns: [new RegExp(escaped), /PG-[0-9A-Z]{6}-[0-9A-Z]{6}/],
            keep: [canary],
          }),
        );
        expect(out).not.toContain(secret);
        expect(out).toContain(REDACTED);
        expect(out).toContain(canary);
      }),
      { numRuns: 200 },
    );
  });
});
