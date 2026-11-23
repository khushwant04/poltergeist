import type { Direction, HauntingRef, JSONRPCMessage, Plan, TraceLine } from "./types.js";

/** One frame as the Séance Room shows it. */
export interface BundleFrame {
  seq: number;
  dir: Direction;
  t: number;
  method?: string;
  toolName?: string;
  occurrence?: number;
  msg: JSONRPCMessage;
  original?: JSONRPCMessage;
  cause?: HauntingRef;
  delivery?: "sent" | "delayed" | "dropped" | "held" | "discarded";
  injected?: boolean;
  copy?: number;
}

export interface BundleApplied {
  entryIndex: number;
  haunting: string;
  family: string;
  seq: number;
  description: string;
  record?: Record<string, unknown>;
}

export interface BundleVerdict {
  oracle: string;
  family: "security" | "task" | "recovery" | "truth";
  applicable: boolean;
  pass: boolean;
  reason: string;
  evidence: { seqs: number[]; excerpt: string };
}

export interface BundleScore {
  score: number;
  capped: boolean;
  families: Record<"security" | "task" | "recovery" | "truth", { applicable: number; passed: number }>;
}

export interface BundleShrink {
  status: "minimal" | "partial" | "flaky";
  target: string;
  original: Plan;
  minimal: Plan;
  failureRate: number;
  confirmTrials: number;
}

/** Everything about one run, in one file. The UI reads only this. */
export interface RunBundle {
  version: 1;
  runId: string;
  startedAt: string;
  versions: { poltergeist: string; catalog: string; fastCheck: string };
  scenario: { id: string; task: string };
  agent: string;
  seed: number;
  trial: number;
  status: string;
  planHash: string | null;
  plan: Plan | null;
  frames: BundleFrame[];
  applied: BundleApplied[];
  answer: string | null;
  verdicts: BundleVerdict[];
  score: BundleScore;
  shrink?: BundleShrink;
}

export interface BundleIndexEntry {
  runId: string;
  startedAt: string;
  scenarioId: string;
  agent: string;
  seed: number;
  trial: number;
  status: string;
  score: number;
  capped: boolean;
  hauntings: string[];
  failing: string[];
  hasShrink: boolean;
  /** True while a live run is still being recorded. */
  live?: boolean;
}

export interface BundleIndex {
  version: 1;
  generatedAt: string;
  runs: BundleIndexEntry[];
}

export interface CatalogEntry {
  id: string;
  family: string;
  summary: string;
  tests: string;
}

/** A trace frame line as a bundle frame (used by the exporter and the live view). */
export function lineToFrame(l: Extract<TraceLine, { type: "frame" }>): BundleFrame {
  const f: BundleFrame = { seq: l.seq, dir: l.dir, t: l.t, msg: l.msg as unknown as JSONRPCMessage };
  if (l.method !== undefined) f.method = l.method;
  if (l.toolName !== undefined) f.toolName = l.toolName;
  if (l.occurrence !== undefined) f.occurrence = l.occurrence;
  if (l.original !== undefined) f.original = l.original as unknown as JSONRPCMessage;
  if (l.cause !== undefined) f.cause = l.cause;
  if (l.delivery !== undefined) f.delivery = l.delivery;
  if (l.injected !== undefined) f.injected = l.injected;
  if (l.copy !== undefined) f.copy = l.copy;
  return f;
}
