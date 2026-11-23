import fc from "fast-check";
import { hashOf, type Frame, type JSONRPCMessage } from "@poltergeist/core";
import type { Haunting } from "../types.js";
import { occurrenceArb } from "./injection-common.js";

export interface ErrorStormParams {
  k: number;
  style: "isError" | "jsonrpc";
}

interface StormState {
  argsKey: string;
  errored: number;
}

const argsKey = (f: Readonly<Frame>): string => `${f.request?.toolName ?? ""}:${hashOf(f.request?.args ?? null)}`;

function errorFor(frame: Readonly<Frame>, style: ErrorStormParams["style"], attempt: number): JSONRPCMessage {
  const id = (frame.msg as unknown as { id: string | number }).id;
  if (style === "jsonrpc") {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error: upstream service unavailable" } } as JSONRPCMessage;
  }
  return {
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text: `Error: service temporarily unavailable (503). Attempt ${attempt} failed; try again.` }], isError: true },
  } as JSONRPCMessage;
}

/** Fails the first k attempts of a call (same tool and arguments), then lets retries through. */
export const errorStorm: Haunting<ErrorStormParams> = {
  id: "error-storm",
  family: "data",
  requires: [],
  entry(ctx) {
    const tools = [...ctx.scenario.tools].sort();
    return fc
      .record({
        tool: fc.constantFrom(...tools),
        occurrence: occurrenceArb(ctx),
        k: fc.integer({ min: 1, max: 3 }),
        style: fc.constantFrom<ErrorStormParams["style"]>("isError", "jsonrpc"),
      })
      .map(({ tool, occurrence, k, style }) => ({ target: { method: "tools/call", toolName: tool, occurrence }, params: { k, style } }));
  },
  follows({ frame, params, state }) {
    const s = state as StormState | undefined;
    return s !== undefined && frame.request?.method === "tools/call" && argsKey(frame) === s.argsKey && s.errored < params.k;
  },
  apply({ frame, params, state }) {
    const prev = state as StormState | undefined;
    const errored = (prev?.errored ?? 0) + 1;
    const next: StormState = { argsKey: prev?.argsKey ?? argsKey(frame), errored };
    return {
      effect: { kind: "replace", msg: errorFor(frame, params.style, errored), cause: { entryIndex: -1, haunting: "error-storm" } },
      state: next,
      record: { attempt: errored, of: params.k },
    };
  },
  shrinkParams(p) {
    const out: ErrorStormParams[] = [];
    if (p.k > 1) out.push({ ...p, k: p.k - 1 });
    if (p.style === "jsonrpc") out.push({ ...p, style: "isError" });
    return out;
  },
  size: (p) => p.k * 2 + (p.style === "jsonrpc" ? 1 : 0),
  describe: (p, t) =>
    `Error storm: the first ${p.k} attempt${p.k > 1 ? "s" : ""} of ${t.toolName ?? t.method} call #${t.occurrence} fail${p.k > 1 ? "" : "s"}`,
};
