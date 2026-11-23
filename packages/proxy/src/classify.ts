import type { JSONRPCMessage } from "@poltergeist/core";

type Obj = Record<string, unknown>;

export type Classified =
  | { kind: "request"; id: string | number; method: string; params?: Obj }
  | { kind: "notification"; method: string; params?: Obj }
  | { kind: "response"; id: string | number }
  | { kind: "unknown" };

export function classify(msg: JSONRPCMessage): Classified {
  const m = msg as unknown as Obj;
  const id = m["id"];
  const method = m["method"];
  const rawParams = m["params"];
  const params =
    rawParams !== null && typeof rawParams === "object" && !Array.isArray(rawParams) ? (rawParams as Obj) : undefined;
  const hasId = typeof id === "string" || typeof id === "number";
  if (typeof method === "string") {
    if (hasId) return params ? { kind: "request", id, method, params } : { kind: "request", id, method };
    return params ? { kind: "notification", method, params } : { kind: "notification", method };
  }
  if (hasId && ("result" in m || "error" in m)) return { kind: "response", id };
  return { kind: "unknown" };
}
