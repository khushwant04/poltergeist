import type { BundleShrink } from "@poltergeist/core";

type Plan = BundleShrink["minimal"];
import { hauntingLabel } from "./labels.js";

export interface PlanDiffRow {
  haunting: string;
  name: string;
  plain: string;
  target: string;
  kept: boolean;
  /** Params of the minimal entry when they shrank. */
  shrunkParams?: unknown;
  params: unknown;
}

const key = (e: Plan["entries"][number]) => `${e.haunting}|${e.target.method}|${e.target.toolName ?? ""}|${e.target.occurrence}`;

/** Original entries, marked kept or removed by shrinking, with shrunk parameters where they changed. */
export function toPlanDiff(original: Plan, minimal: Plan): PlanDiffRow[] {
  const kept = new Map(minimal.entries.map((e) => [key(e), e]));
  return original.entries.map((e) => {
    const m = kept.get(key(e));
    const l = hauntingLabel(e.haunting);
    const row: PlanDiffRow = {
      haunting: e.haunting,
      name: l.name,
      plain: l.plain,
      target: `${e.target.toolName ?? e.target.method} #${e.target.occurrence}`,
      kept: m !== undefined,
      params: e.params,
    };
    if (m && JSON.stringify(m.params) !== JSON.stringify(e.params)) row.shrunkParams = m.params;
    return row;
  });
}
