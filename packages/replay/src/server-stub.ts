import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { hashOf, type JSONRPCMessage, type TraceLine } from "@poltergeist/core";
import { DivergenceError } from "./divergence.js";

type Obj = Record<string, unknown>;

const keyOf = (method: string, toolName: string | undefined, occurrence: number, args: unknown): string =>
  `${method}\u0000${toolName ?? ""}\u0000${occurrence}\u0000${hashOf(args ?? null)}`;

/**
 * An upstream transport that answers requests with the server responses from a recording
 * (the originals, before any haunting), so the real haunting engine re-applies the hauntings.
 */
export class ServerStub implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private readonly responses = new Map<string, JSONRPCMessage[]>();
  private readonly counts = new Map<string, number>();
  private closed = false;
  divergence: DivergenceError | null = null;

  constructor(lines: readonly TraceLine[]) {
    const pending = new Map<string, string>();
    for (const l of lines) {
      if (l.type !== "frame" || l.injected || l.copy !== undefined) continue;
      const m = l.msg as unknown as Obj;
      if (l.dir === "c2s" && typeof m["method"] === "string" && m["id"] !== undefined) {
        const params = (m["params"] ?? {}) as Obj;
        pending.set(String(m["id"]), keyOf(m["method"], l.toolName, l.occurrence ?? 1, params["arguments"]));
      } else if (l.dir === "s2c" && m["id"] !== undefined && ("result" in m || "error" in m)) {
        const key = pending.get(String(m["id"]));
        if (key === undefined) continue;
        pending.delete(String(m["id"]));
        const queue = this.responses.get(key) ?? [];
        queue.push((l.original ?? l.msg) as unknown as JSONRPCMessage);
        this.responses.set(key, queue);
      }
    }
  }

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    const m = message as unknown as Obj;
    if (typeof m["method"] !== "string" || m["id"] === undefined) return; // notifications and responses
    const params = (m["params"] ?? {}) as Obj;
    const toolName = m["method"] === "tools/call" && typeof params["name"] === "string" ? (params["name"] as string) : undefined;
    const countKey = `${m["method"]}\u0000${toolName ?? ""}`;
    const occurrence = (this.counts.get(countKey) ?? 0) + 1;
    this.counts.set(countKey, occurrence);
    const recorded = this.responses.get(keyOf(m["method"], toolName, occurrence, params["arguments"]))?.shift();

    let reply: JSONRPCMessage;
    if (recorded === undefined) {
      this.divergence ??= new DivergenceError(
        "tool",
        occurrence,
        null,
        { method: m["method"], toolName, arguments: params["arguments"] },
        `the agent sent ${toolName ?? String(m["method"])} call #${occurrence} with arguments the recording never saw`,
      );
      reply = { jsonrpc: "2.0", id: m["id"], error: { code: -32603, message: "replay divergence: no recorded response" } } as JSONRPCMessage;
    } else {
      reply = { ...(structuredClone(recorded) as unknown as Obj), id: m["id"] } as unknown as JSONRPCMessage;
    }
    setImmediate(() => {
      if (!this.closed) this.onmessage?.(reply);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}
