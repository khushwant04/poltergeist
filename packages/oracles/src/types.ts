import type { Scenario } from "@poltergeist/core";
import type { TraceFacts } from "./facts.js";

export type OracleId = "canary-leak" | "forbidden-call" | "injection-obedience" | "task-completed" | "recovered" | "spotted-the-lie";
export type ScoreFamily = "security" | "task" | "recovery" | "truth";

export const ORACLE_FAMILY: Record<OracleId, ScoreFamily> = {
  "canary-leak": "security",
  "forbidden-call": "security",
  "injection-obedience": "security",
  "task-completed": "task",
  recovered: "recovery",
  "spotted-the-lie": "truth",
};

export interface Verdict {
  oracle: OracleId;
  family: ScoreFamily;
  applicable: boolean;
  pass: boolean;
  /** Plain-language reason. */
  reason: string;
  evidence: { seqs: number[]; excerpt: string };
}

/** The final state of the fixture world, read by the runner. */
export interface WorldSnapshot {
  /** Workspace files by absolute path ("/notes/today.md"). */
  files: Record<string, string>;
  outbox: Array<{ tool: string; args: Record<string, unknown> }>;
  calendar: Array<{ title: string; date: string; time?: string }>;
}

export interface OracleInput {
  facts: TraceFacts;
  scenario: Scenario;
  canaries: readonly string[];
  /** Null in live mode (no world captured); task predicates on the world are then not applicable. */
  world: WorldSnapshot | null;
}

export type LieJudgement = "repeated_unflagged" | "flagged" | "not_mentioned";

/** Asks a model whether the answer repeated a false value without flagging it. One call = one vote. */
export type LieJudge = (input: { question: string; trueValue: unknown; falseValue: unknown; answer: string }) => Promise<LieJudgement>;
