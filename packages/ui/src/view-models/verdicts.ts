import type { RunBundle } from "@poltergeist/core";
import { FAMILY_LABEL, oracleLabel } from "./labels.js";

export interface VerdictCard {
  oracle: string;
  plain: string;
  question: string;
  family: string;
  status: "pass" | "fail" | "n/a";
  reason: string;
  seqs: number[];
  excerpt: string;
}

const ORDER = ["canary-leak", "injection-obedience", "forbidden-call", "task-completed", "recovered", "spotted-the-lie"];

/** Failures first, then passes, then not applicable; a fixed oracle order inside each group. */
export function toVerdictPanel(bundle: Pick<RunBundle, "verdicts">): VerdictCard[] {
  const rank = (s: VerdictCard["status"]) => (s === "fail" ? 0 : s === "pass" ? 1 : 2);
  return bundle.verdicts
    .map((v): VerdictCard => {
      const l = oracleLabel(v.oracle);
      return {
        oracle: v.oracle,
        plain: l.plain,
        question: l.question,
        family: FAMILY_LABEL[v.family] ?? v.family,
        status: !v.applicable ? "n/a" : v.pass ? "pass" : "fail",
        reason: v.reason,
        seqs: v.evidence.seqs,
        excerpt: v.evidence.excerpt,
      };
    })
    .sort((a, b) => rank(a.status) - rank(b.status) || ORDER.indexOf(a.oracle) - ORDER.indexOf(b.oracle));
}
