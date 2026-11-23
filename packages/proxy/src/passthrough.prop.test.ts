import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FakeClock, canonicalJson } from "@poltergeist/core";
import { Proxy } from "./proxy.js";
import { CaptureTransport, trafficArb } from "./test-arbitraries.js";

describe("proxy-core", () => {
  // Validates: Requirements 1.2, 3.6
  it("Property 1: pass-through is invisible", async () => {
    await fc.assert(
      fc.asyncProperty(trafficArb, async (traffic) => {
        const agent = new CaptureTransport();
        const upstream = new CaptureTransport();
        const proxy = new Proxy({ agent, upstream, clock: new FakeClock() });
        await proxy.start();
        for (const { dir, msg } of traffic) proxy.handle(dir, msg);
        const expectUp = traffic.filter((t) => t.dir === "c2s").map((t) => canonicalJson(t.msg));
        const expectDown = traffic.filter((t) => t.dir === "s2c").map((t) => canonicalJson(t.msg));
        expect(upstream.sent.map(canonicalJson)).toEqual(expectUp);
        expect(agent.sent.map(canonicalJson)).toEqual(expectDown);
      }),
      { numRuns: 200 },
    );
  });
});
