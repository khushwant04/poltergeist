import fc from "fast-check";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Direction, JSONRPCMessage } from "@poltergeist/core";

export const idArb: fc.Arbitrary<string | number> = fc.oneof(fc.nat({ max: 1000 }), fc.string({ minLength: 1, maxLength: 6 }));
export const toolNameArb = fc.constantFrom("read_file", "send_email", "get_balance", "search");
export const methodArb = fc.constantFrom("tools/call", "tools/list", "resources/read", "ping", "prompts/get");

export const requestArb: fc.Arbitrary<JSONRPCMessage> = fc
  .record({ id: idArb, method: methodArb, tool: toolNameArb, args: fc.dictionary(fc.string({ maxLength: 5 }), fc.jsonValue({ maxDepth: 2 })) })
  .map(({ id, method, tool, args }) =>
    (method === "tools/call"
      ? { jsonrpc: "2.0", id, method, params: { name: tool, arguments: args } }
      : { jsonrpc: "2.0", id, method, params: {} }) as JSONRPCMessage,
  );

export const notificationArb: fc.Arbitrary<JSONRPCMessage> = fc
  .constantFrom("notifications/progress", "notifications/message", "notifications/tools/list_changed")
  .map((method) => ({ jsonrpc: "2.0", method, params: {} }) as JSONRPCMessage);

export const responseArb: fc.Arbitrary<JSONRPCMessage> = fc
  .record({ id: idArb, value: fc.jsonValue({ maxDepth: 3 }) })
  .map(({ id, value }) => ({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value) ?? "null" }] } }) as JSONRPCMessage);

export const anyMessageArb = fc.oneof(requestArb, notificationArb, responseArb);

export const trafficArb: fc.Arbitrary<Array<{ dir: Direction; msg: JSONRPCMessage }>> = fc.array(
  fc.record({ dir: fc.constantFrom<Direction>("c2s", "s2c"), msg: anyMessageArb }),
  { maxLength: 40 },
);

/** A transport that records what it is asked to send. */
export class CaptureTransport implements Transport {
  readonly sent: JSONRPCMessage[] = [];
  onclose?: () => void;
  onerror?: (e: Error) => void;
  onmessage?: (m: JSONRPCMessage) => void;
  async start(): Promise<void> {}
  async send(m: JSONRPCMessage): Promise<void> {
    this.sent.push(m);
  }
  async close(): Promise<void> {
    this.onclose?.();
  }
}
