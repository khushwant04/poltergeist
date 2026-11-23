import { z } from "zod";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export type { JSONRPCMessage };

export type Direction = "c2s" | "s2c";

export const opposite = (d: Direction): Direction => (d === "c2s" ? "s2c" : "c2s");

/** The request a frame belongs to: the request itself, or the request a response answers. */
export interface RequestContext {
  id: string | number;
  /** Direction the request travelled in. */
  dir: Direction;
  method: string;
  toolName?: string;
  args?: unknown;
  occurrence: number;
}

export interface Frame {
  seq: number;
  dir: Direction;
  /** ms since run start. */
  t: number;
  msg: JSONRPCMessage;
  kind: "request" | "notification" | "response" | "unknown";
  request?: RequestContext;
  occurrence?: number;
  /** A response whose request was already answered or never seen. */
  orphan?: boolean;
}

export interface HauntingRef {
  entryIndex: number;
  haunting: string;
}

export type Effect =
  | { kind: "forward" }
  | { kind: "replace"; msg: JSONRPCMessage; cause: HauntingRef }
  | { kind: "delay"; ms: number; cause: HauntingRef }
  | { kind: "drop"; cause: HauntingRef }
  | { kind: "duplicate"; copies: number; gapMs: number; cause: HauntingRef }
  | { kind: "hold"; cause: HauntingRef }
  | { kind: "inject"; msg: JSONRPCMessage; then: Effect; cause: HauntingRef };

export const FORWARD: Effect = Object.freeze({ kind: "forward" });

export interface PipelineContext {
  /** Capabilities the plan needs, e.g. "tools.listChanged". */
  requires: ReadonlySet<string>;
}

/** Interceptors decide; they never perform I/O or touch the clock. */
export interface Interceptor {
  name: string;
  onFrame(frame: Readonly<Frame>, ctx: PipelineContext): Effect;
}

// ---------- Schemas ----------

const jsonRpcMessage = z.looseObject({ jsonrpc: z.literal("2.0") });

export const HauntingRefSchema = z.object({ entryIndex: z.number().int(), haunting: z.string() });

export const PlanEntrySchema = z.object({
  haunting: z.string().min(1),
  target: z.object({
    method: z.string().min(1),
    toolName: z.string().min(1).optional(),
    occurrence: z.number().int().min(1),
  }),
  params: z.unknown(),
});

export const PlanSchema = z.object({
  version: z.literal(1),
  catalogVersion: z.string(),
  seed: z.number().int().min(0).max(0xffffffff),
  scenarioId: z.string(),
  entries: z.array(PlanEntrySchema),
  requires: z.array(z.string()),
});

export type PlanEntry = z.infer<typeof PlanEntrySchema>;
export type Plan = z.infer<typeof PlanSchema>;

export const TraceHeaderSchema = z.object({
  type: z.literal("header"),
  runId: z.string(),
  versions: z.object({ poltergeist: z.string(), catalog: z.string(), fastCheck: z.string() }),
  seed: z.number().int().nullable(),
  planHash: z.string().nullable(),
  scenarioId: z.string().nullable(),
  startedAt: z.string(),
});

export const TraceFrameSchema = z.object({
  type: z.literal("frame"),
  seq: z.number().int().min(1),
  dir: z.enum(["c2s", "s2c"]),
  t: z.number(),
  msg: jsonRpcMessage,
  original: jsonRpcMessage.optional(),
  cause: HauntingRefSchema.optional(),
  injected: z.boolean().optional(),
  copy: z.number().int().optional(),
  delivery: z.enum(["sent", "delayed", "dropped", "held", "discarded"]).optional(),
  occurrence: z.number().int().optional(),
  method: z.string().optional(),
  toolName: z.string().optional(),
});

export const TraceEventSchema = z.object({
  type: z.literal("event"),
  t: z.number(),
  name: z.enum([
    "interceptor_error",
    "child_exit",
    "late_response_discarded",
    "hold_timeout",
    "malformed_message",
    "effect_applied",
  ]),
  detail: z.record(z.string(), z.unknown()),
});

export const TraceLlmSchema = z.object({
  type: z.literal("llm"),
  i: z.number().int(),
  requestHash: z.string(),
  response: z.unknown(),
});

export const TraceLineSchema = z.discriminatedUnion("type", [
  TraceHeaderSchema,
  TraceFrameSchema,
  TraceEventSchema,
  TraceLlmSchema,
]);

export type TraceHeader = z.infer<typeof TraceHeaderSchema>;
export type TraceFrameLine = z.infer<typeof TraceFrameSchema>;
export type TraceEventLine = z.infer<typeof TraceEventSchema>;
export type TraceLine = z.infer<typeof TraceLineSchema>;

/** Parse a JSONL trace into validated lines. Throws with the line number on the first bad line. */
export function parseTrace(text: string): TraceLine[] {
  const out: TraceLine[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined || raw.trim() === "") continue;
    const parsed = TraceLineSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`trace line ${i + 1}: ${parsed.error.message}`);
    out.push(parsed.data);
  }
  return out;
}
