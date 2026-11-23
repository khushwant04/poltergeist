import { describe, expect, it } from "vitest";
import { FakeClock, type JSONRPCMessage } from "@poltergeist/core";
import { Proxy } from "./proxy.js";
import { CaptureTransport } from "./test-arbitraries.js";

async function initResult(requires: string[]) {
  const agent = new CaptureTransport();
  const proxy = new Proxy({ agent, upstream: new CaptureTransport(), clock: new FakeClock(), requires });
  await proxy.start();
  proxy.handle("c2s", { jsonrpc: "2.0", id: 0, method: "initialize", params: {} } as JSONRPCMessage);
  proxy.handle("s2c", { jsonrpc: "2.0", id: 0, result: { capabilities: { tools: {} }, serverInfo: { name: "s", version: "1" } } } as JSONRPCMessage);
  return agent.sent[0] as unknown as { result: { capabilities: { tools: { listChanged?: boolean } } } };
}

describe("initialize rewriter", () => {
  it("leaves initialize untouched by default", async () => {
    expect((await initResult([])).result.capabilities.tools.listChanged).toBeUndefined();
  });

  it("advertises tools.listChanged when the plan requires it", async () => {
    expect((await initResult(["tools.listChanged"])).result.capabilities.tools.listChanged).toBe(true);
  });
});
