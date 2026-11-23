import fc from "fast-check";
import { canonicalJson, hashOf, type Plan, type PlanEntry, type ScenarioContext } from "@poltergeist/core";
import { CATALOG, type Catalog } from "./catalog/index.js";

/** Hauntings this scenario allows (all of them when the allow list is empty) that can apply to it. */
export function applicableHauntings(ctx: ScenarioContext, catalog: Catalog = CATALOG) {
  const allow = ctx.scenario.hauntings.allow;
  return catalog.hauntings
    .filter((h) => allow.length === 0 || allow.includes(h.id))
    .map((h) => ({ h, arb: h.entry(ctx) }))
    .filter((x): x is { h: (typeof x)["h"]; arb: NonNullable<(typeof x)["arb"]> } => x.arb !== null);
}

/** fast-check arbitrary for a plan's entries. */
export function planEntriesArb(ctx: ScenarioContext, catalog: Catalog = CATALOG): fc.Arbitrary<PlanEntry[]> {
  const max = ctx.scenario.hauntings.maxPerRun;
  const options = applicableHauntings(ctx, catalog).map(({ h, arb }) =>
    arb.map((e): PlanEntry => ({ haunting: h.id, target: e.target, params: e.params })),
  );
  if (options.length === 0 || max === 0) return fc.constant([]);
  return fc.array(fc.oneof(...options), { minLength: 1, maxLength: max });
}

const entryKey = (e: PlanEntry): string =>
  [e.target.method, e.target.toolName ?? "", String(e.target.occurrence).padStart(4, "0"), e.haunting, canonicalJson(e.params)].join("\u0000");

/** Stable order and no exact duplicates. */
export function normaliseEntries(entries: readonly PlanEntry[]): PlanEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((a, b) => (entryKey(a) < entryKey(b) ? -1 : entryKey(a) > entryKey(b) ? 1 : 0))
    .filter((e) => {
      const k = entryKey(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function requiresOf(entries: readonly PlanEntry[], catalog: Catalog = CATALOG): string[] {
  const out = new Set<string>();
  for (const e of entries) for (const r of catalog.byId.get(e.haunting)?.requires ?? []) out.add(r);
  return [...out].sort();
}

/** Seed → plan. All randomness happens here, driven only by the seed. */
export function generatePlan(seed: number, ctx: ScenarioContext, catalog: Catalog = CATALOG): Plan {
  const [entries] = fc.sample(planEntriesArb(ctx, catalog), { seed: seed | 0, numRuns: 1 });
  const normalised = normaliseEntries(entries ?? []);
  return {
    version: 1,
    catalogVersion: catalog.version,
    seed: seed >>> 0,
    scenarioId: ctx.scenario.id,
    entries: normalised,
    requires: requiresOf(normalised, catalog),
  };
}

export const planHash = (plan: Plan): string => hashOf(plan);
