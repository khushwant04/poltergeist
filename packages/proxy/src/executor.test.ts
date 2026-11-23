import { describe, expect, it } from "vitest";
import { FakeClock, type Effect, type Frame, type Interceptor, type JSONRPCMessage } from "@poltergeist/core";
import { Proxy } from "./proxy.js";
import { MemoryTraceSink } from "./recorder.js";
import { CaptureTransport } from "./test-arbitraries.js";

const cause = { entryIndex: 0, haunting: "test" };

/** An interceptor that applies `effect` to the response of tools/call `target`. */
function on(target: string, effect: Effect): Interceptor {
  return {
    name: "test",
    onFrame: (f: Readonly<Frame>) =>
      f.dir === "s2c" && f.kind === "response" && f.request?.toolName === target ? effect : { kind: "forward" },
  };
}

async function setup(interceptor: Interceptor, holdTimeoutMs?: number) {
  const clock = new FakeClock();
  const agent = new CaptureTransport();
  const upstream = new CaptureTransport();
  const sink = new MemoryTraceSink();
  const proxy = new Proxy({
    agent,
    upstream,
    clock,
    sink,
    interceptors: [interceptor],
    ...(holdTimeoutMs !== undefined ? { holdTimeoutMs } : {}),
  });
  await proxy.start();
  const call = (id: number, name: string) =>
    proxy.handle("c2s", { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } } as JSONRPCMessage);
  const reply = (id: number, text = `r${id}`) =>
    proxy.handle("s2c", { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } } as JSONRPCMessage);
  const ids = () => agent.sent.map((m) => (m as unknown as { id?: number }).id ?? (m as unknown as { method: string }).method);
  return { clock, agent, upstream, sink, proxy, call, reply, ids };
}

describe("effects", () => {
  it("delay forwards later without blocking other messages", async () => {
    const s = await setup(on("slow", { kind: "delay", ms: 500, cause }));
    s.call(1, "slow");
    s.call(2, "fast");
    s.reply(1);
    s.reply(2);
    expect(s.ids()).toEqual([2]);
    s.clock.advance(499);
    expect(s.ids()).toEqual([2]);
    s.clock.advance(1);
    expect(s.ids()).toEqual([2, 1]);
    const frame = s.sink.lines.find((l) => l.type === "frame" && l.seq === 3);
    expect(frame).toMatchObject({ delivery: "delayed", cause });
  });

  it("drop never forwards, and a late response after cancellation is discarded", async () => {
    const s = await setup(on("gone", { kind: "drop", cause }));
    s.call(1, "gone");
    s.reply(1);
    expect(s.ids()).toEqual([]);
    expect(s.sink.lines.some((l) => l.type === "frame" && l.delivery === "dropped")).toBe(true);

    s.call(2, "other");
    s.proxy.handle("c2s", { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 2 } } as JSONRPCMessage);
    expect(s.upstream.sent.at(-1)).toMatchObject({ method: "notifications/cancelled" });
    s.reply(2);
    expect(s.ids()).toEqual([]);
    expect(s.sink.lines.some((l) => l.type === "event" && l.name === "late_response_discarded")).toBe(true);
  });

  it("duplicate forwards copies + 1 times, gapMs apart", async () => {
    const s = await setup(on("echo", { kind: "duplicate", copies: 2, gapMs: 100, cause }));
    s.call(1, "echo");
    s.reply(1);
    expect(s.ids()).toEqual([1]);
    s.clock.advance(100);
    expect(s.ids()).toEqual([1, 1]);
    s.clock.advance(100);
    expect(s.ids()).toEqual([1, 1, 1]);
    const copies = s.sink.lines.filter((l) => l.type === "frame" && l.copy !== undefined);
    expect(copies.map((c) => (c as { copy: number }).copy)).toEqual([1, 2]);
  });

  it("hold releases right after the next server-to-client response", async () => {
    const s = await setup(on("held", { kind: "hold", cause }));
    s.call(1, "held");
    s.call(2, "next");
    s.reply(1);
    expect(s.ids()).toEqual([]);
    s.reply(2);
    expect(s.ids()).toEqual([2, 1]);
  });

  it("hold releases after the timeout when nothing else arrives", async () => {
    const s = await setup(on("held", { kind: "hold", cause }), 10_000);
    s.call(1, "held");
    s.reply(1);
    s.clock.advance(9_999);
    expect(s.ids()).toEqual([]);
    s.clock.advance(1);
    expect(s.ids()).toEqual([1]);
    expect(s.sink.lines.some((l) => l.type === "event" && l.name === "hold_timeout")).toBe(true);
  });

  it("inject sends a new message to the agent right after the frame", async () => {
    const note = { jsonrpc: "2.0", method: "notifications/tools/list_changed" } as JSONRPCMessage;
    const s = await setup(on("x", { kind: "inject", msg: note, then: { kind: "forward" }, cause }));
    s.call(1, "x");
    s.reply(1);
    expect(s.ids()).toEqual([1, "notifications/tools/list_changed"]);
    expect(s.sink.lines.some((l) => l.type === "frame" && l.injected === true)).toBe(true);
  });

  it("replace forwards the replacement and records the original", async () => {
    const replacement = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "haunted" }] } } as JSONRPCMessage;
    const s = await setup(on("x", { kind: "replace", msg: replacement, cause }));
    s.call(1, "x");
    s.reply(1, "original");
    expect(s.agent.sent).toEqual([replacement]);
    const frame = s.sink.lines.find((l) => l.type === "frame" && l.dir === "s2c");
    expect(frame).toMatchObject({ original: { result: { content: [{ text: "original" }] } }, cause, delivery: "sent" });
  });
});
