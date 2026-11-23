import { describe, expect, it } from "vitest";
import { ChildProcessTransport } from "./child-transport.js";

describe("ChildProcessTransport", () => {
  it("sends SIGTERM, then SIGKILL after the grace period if the child ignores it", async () => {
    const child = new ChildProcessTransport({
      command: process.execPath,
      args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdin.resume();"],
      killGraceMs: 300,
    });
    await child.start();
    await new Promise((r) => setTimeout(r, 150)); // let the child install its SIGTERM handler
    const started = Date.now();
    await child.close();
    expect(child.exitSignal).toBe("SIGKILL");
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  it("reports the exit code and passes JSON-RPC lines through, flagging other output", async () => {
    const malformed: string[] = [];
    const received: unknown[] = [];
    const child = new ChildProcessTransport({
      command: process.execPath,
      args: ["-e", "console.log('not json'); console.log(JSON.stringify({jsonrpc:'2.0',method:'x'})); process.exit(3)"],
      onMalformed: (l) => malformed.push(l),
    });
    child.onmessage = (m) => received.push(m);
    await child.start();
    await child.exited;
    expect(child.exitCode).toBe(3);
    expect(received).toEqual([{ jsonrpc: "2.0", method: "x" }]);
    expect(malformed).toEqual(["not json"]);
  });
});
