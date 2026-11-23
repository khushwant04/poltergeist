import type { Plan, PlanEntry } from "@poltergeist/core";
import { CATALOG, requiresOf, type Catalog } from "@poltergeist/hauntings";
import type { OracleId } from "@poltergeist/oracles";

/** Runs one trial of a candidate plan. Implemented by the runner; faked in tests. */
export interface TrialRunner {
  runTrial(plan: Plan): Promise<{ failed: ReadonlySet<OracleId | string>; runId?: string }>;
}

export interface ShrinkOptions {
  target: OracleId | string;
  /** Trials per candidate; a candidate fails when at least ceil(trials / 2) of them fail. */
  trials?: number;
  /** Maximum trials for the search (the confirm step has its own). */
  budget?: number;
  confirmTrials?: number;
  catalog?: Catalog;
  onProgress?: (e: ShrinkEvent) => void;
}

export type ShrinkEvent =
  | { kind: "trial"; entries: number; failed: boolean; trialsUsed: number }
  | { kind: "candidate"; phase: "repro" | "empty" | "entries" | "params" | "confirm"; entries: number; accepted: boolean };

export interface ShrinkResult {
  status: "minimal" | "partial" | "flaky";
  original: Plan;
  minimal: Plan;
  target: string;
  trialsUsed: number;
  /** Share of confirm trials that failed (0 when flaky). */
  failureRate: number;
  confirmTrials: number;
}

const keyOf = (e: PlanEntry) => `${e.haunting}\u0000${e.target.method}\u0000${e.target.toolName ?? ""}\u0000${e.target.occurrence}`;
const needed = (k: number) => Math.ceil(k / 2);

class BudgetExhausted extends Error {}

/**
 * Reduce a failing plan to the smallest one that still fails the target oracle:
 * repro check → delta debugging over entries → parameter shrinking → confirm.
 */
export async function shrinkPlan(original: Plan, runner: TrialRunner, opts: ShrinkOptions): Promise<ShrinkResult> {
  const trials = opts.trials ?? 3;
  const budget = opts.budget ?? 40;
  const confirmTrials = opts.confirmTrials ?? 5;
  const catalog = opts.catalog ?? CATALOG;
  const progress = opts.onProgress ?? (() => {});
  let used = 0;
  let partial = false;

  const withEntries = (entries: PlanEntry[]): Plan => ({ ...original, entries, requires: requiresOf(entries, catalog) });

  /** Majority vote; stops early once the outcome is decided. */
  const isFailing = async (entries: PlanEntry[], phase: Extract<ShrinkEvent, { kind: "candidate" }>["phase"]): Promise<boolean> => {
    let failures = 0;
    for (let t = 0; t < trials; t++) {
      if (failures >= needed(trials) || failures + (trials - t) < needed(trials)) break;
      if (used >= budget) throw new BudgetExhausted();
      used++;
      const r = await runner.runTrial(withEntries(entries));
      const failed = r.failed.has(opts.target);
      if (failed) failures++;
      progress({ kind: "trial", entries: entries.length, failed, trialsUsed: used });
    }
    const accepted = failures >= needed(trials);
    progress({ kind: "candidate", phase, entries: entries.length, accepted });
    return accepted;
  };

  // 1. Does the failure reproduce at all?
  let current = [...original.entries];
  try {
    if (!(await isFailing(current, "repro"))) {
      return { status: "flaky", original, minimal: original, target: String(opts.target), trialsUsed: used, failureRate: 0, confirmTrials: 0 };
    }
  } catch (e) {
    if (!(e instanceof BudgetExhausted)) throw e;
    return { status: "partial", original, minimal: original, target: String(opts.target), trialsUsed: used, failureRate: 0, confirmTrials: 0 };
  }

  try {
    // 2a. Maybe no haunting is needed at all.
    if (current.length > 0 && (await isFailing([], "empty"))) current = [];

    // 2b. Delta debugging over entries (ddmin): subsets, then complements, then finer chunks.
    let n = 2;
    while (current.length >= 2) {
      const size = Math.ceil(current.length / n);
      const chunks: PlanEntry[][] = [];
      for (let i = 0; i < current.length; i += size) chunks.push(current.slice(i, i + size));
      let reduced = false;
      for (const chunk of chunks) {
        if (chunk.length < current.length && (await isFailing(chunk, "entries"))) {
          current = chunk;
          n = 2;
          reduced = true;
          break;
        }
      }
      if (!reduced && chunks.length > 2) {
        for (let i = 0; i < chunks.length; i++) {
          const complement = chunks.filter((_, j) => j !== i).flat();
          if (await isFailing(complement, "entries")) {
            current = complement;
            n = Math.max(n - 1, 2);
            reduced = true;
            break;
          }
        }
      }
      if (!reduced) {
        if (n >= current.length) break;
        n = Math.min(n * 2, current.length);
      }
    }

    // 3. Shrink each remaining entry's parameters.
    for (let i = 0; i < current.length; i++) {
      const h = catalog.byId.get(current[i]!.haunting);
      if (!h) continue;
      let improved = true;
      while (improved) {
        improved = false;
        for (const params of h.shrinkParams(current[i]!.params)) {
          const candidate = current.map((e, j) => (j === i ? { ...e, params } : e));
          if (await isFailing(candidate, "params")) {
            current = candidate;
            improved = true;
            break;
          }
        }
      }
    }
  } catch (e) {
    if (!(e instanceof BudgetExhausted)) throw e;
    partial = true;
  }

  // 4. Confirm with fresh trials (not counted against the search budget).
  let failures = 0;
  const minimal = withEntries(current);
  for (let t = 0; t < confirmTrials; t++) {
    const r = await runner.runTrial(minimal);
    if (r.failed.has(opts.target)) failures++;
  }
  progress({ kind: "candidate", phase: "confirm", entries: current.length, accepted: failures >= needed(confirmTrials) });

  return {
    status: partial ? "partial" : "minimal",
    original,
    minimal,
    target: String(opts.target),
    trialsUsed: used,
    failureRate: confirmTrials === 0 ? 0 : failures / confirmTrials,
    confirmTrials,
  };
}

/** Entries of `minimal` all come from `original` (same haunting and target). */
export const isSubsetPlan = (minimal: Plan, original: Plan): boolean => {
  const keys = new Set(original.entries.map(keyOf));
  return minimal.entries.every((e) => keys.has(keyOf(e)));
};
