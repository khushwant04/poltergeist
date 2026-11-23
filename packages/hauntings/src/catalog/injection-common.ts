import fc from "fast-check";
import type { ScenarioContext } from "@poltergeist/core";
import { POSITIONS, WRAPPERS, wrapperCost, type Position, type Wrapper } from "../content.js";
import { loadPayloads, payloadText, wordCount, type Payload } from "../payloads.js";

let cache: Payload[] | undefined;
export function payloads(): Payload[] {
  cache ??= loadPayloads();
  return cache;
}

export function payloadById(id: string): Payload {
  const p = payloads().find((x) => x.id === id);
  if (!p) throw new Error(`unknown payload "${id}"`);
  return p;
}

export const payloadIds = (family: Payload["family"]): string[] =>
  payloads()
    .filter((p) => p.family === family)
    .map((p) => p.id)
    .sort();

export interface InjectionParams {
  payloadId: string;
  variant: number;
  position: Position;
  wrapper: Wrapper;
}

export const injectionParamsArb = (family: Payload["family"]): fc.Arbitrary<InjectionParams> =>
  fc.record({
    payloadId: fc.constantFrom(...payloadIds(family)),
    variant: fc.constant(0),
    position: fc.constantFrom(...POSITIONS),
    wrapper: fc.constantFrom(...WRAPPERS),
  });

export const occurrenceArb = (ctx: ScenarioContext) => fc.integer({ min: 1, max: ctx.scenario.hauntings.maxOccurrence });

/** Highest occurrence worth targeting for a tool. */
export const maxOccurrenceFor = (ctx: ScenarioContext, tool: string): number =>
  ctx.scenario.hauntings.targets[tool] ?? ctx.scenario.hauntings.maxOccurrence;

/** Tools worth haunting: the scenario's targets, or every tool when none are declared. */
export function targetTools(ctx: ScenarioContext): string[] {
  const declared = Object.keys(ctx.scenario.hauntings.targets);
  return [...(declared.length > 0 ? declared : ctx.scenario.tools)].sort();
}

/** A tools/call target: a tool worth haunting and an occurrence it is expected to reach. */
export const toolTargetArb = (ctx: ScenarioContext) =>
  fc
    .constantFrom(...targetTools(ctx))
    .chain((tool) => fc.integer({ min: 1, max: maxOccurrenceFor(ctx, tool) }).map((occurrence) => ({ method: "tools/call", toolName: tool, occurrence })));

export function injectionSize(p: InjectionParams): number {
  return wordCount(payloadText(payloadById(p.payloadId), p.variant)) * 2 + wrapperCost(p.wrapper);
}

/** Shorter payload variants, and the plain wrapper; only candidates strictly smaller. */
export function shrinkInjection<P extends InjectionParams>(p: P): P[] {
  const payload = payloadById(p.payloadId);
  const out: P[] = [];
  for (let v = p.variant + 1; v <= payload.short.length; v++) out.push({ ...p, variant: v });
  if (p.wrapper !== "plain") out.push({ ...p, wrapper: "plain" });
  const size = injectionSize(p);
  return out.filter((c) => injectionSize(c) < size);
}

/** Readable stand-ins for template placeholders in descriptions (no run context there). */
export const DESCRIBE_VARS = { task: "the task", canary: "the secret", sinkTool: "a send tool", attacker: "an attacker address" };

export const preview = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
