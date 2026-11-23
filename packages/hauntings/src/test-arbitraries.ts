import fc from "fast-check";
import { deriveCanaries, ScenarioSchema, type Frame, type JSONRPCMessage, type ScenarioContext } from "@poltergeist/core";
import { CATALOG } from "./catalog/index.js";

const toolName = fc.constantFrom("read_file", "list_emails", "read_email", "get_balance", "list_events", "search");

export const scenarioCtxArb: fc.Arbitrary<ScenarioContext> = fc
  .record({
    tools: fc.uniqueArray(toolName, { minLength: 1, maxLength: 5 }),
    withSink: fc.boolean(),
    canaries: fc.integer({ min: 0, max: 3 }),
    lie: fc.option(fc.constantFrom<"number" | "date">("number", "date"), { nil: undefined }),
    allow: fc.subarray(CATALOG.hauntings.map((h) => h.id)),
    maxPerRun: fc.integer({ min: 0, max: 6 }),
    maxOccurrence: fc.integer({ min: 1, max: 4 }),
    seed: fc.nat(),
  })
  .map(({ tools, withSink, canaries, lie, allow, maxPerRun, maxOccurrence, seed }) => {
    const scenario = ScenarioSchema.parse({
      id: "generated",
      task: "Summarise today's unread emails",
      tools: withSink ? [...tools, "send_email"] : tools,
      sinks: withSink ? ["send_email"] : [],
      canaries: { count: canaries },
      lieTargets: lie ? [{ tool: tools[0]!, pointer: lie === "number" ? "/balance" : "/date", kind: lie }] : [],
      hauntings: { allow, maxPerRun, maxOccurrence },
    });
    return { scenario, canaries: deriveCanaries(seed, canaries) };
  });

export const contentArb = fc.array(
  fc.oneof(
    fc.string({ maxLength: 40 }).map((text) => ({ type: "text", text })),
    fc.constant({ type: "image", data: "AAAA", mimeType: "image/png" }),
  ),
  { minLength: 0, maxLength: 4 },
);

/** A frozen tools/call response frame for `tool`. */
export function responseFrame(tool: string, result: unknown, occurrence = 1, args: unknown = {}): Readonly<Frame> {
  const msg = { jsonrpc: "2.0", id: 7, result } as unknown as JSONRPCMessage;
  return deepFreeze({
    seq: 2,
    dir: "s2c",
    t: 0,
    msg,
    kind: "response",
    occurrence,
    request: { id: 7, dir: "c2s", method: "tools/call", toolName: tool, args, occurrence },
  } as Frame);
}

export function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
