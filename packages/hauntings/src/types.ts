import type fc from "fast-check";
import type { Effect, Frame, PlanEntry, ScenarioContext } from "@poltergeist/core";

export type Family = "injection" | "schema" | "timing" | "data";

export type Target = PlanEntry["target"];

export interface ApplyInput<P> {
  /** Deep-frozen frame (a server-to-client response with its request context). */
  frame: Readonly<Frame>;
  params: P;
  ctx: ScenarioContext;
  /** This entry's own state from earlier frames (undefined the first time). */
  state: unknown;
  entryIndex: number;
}

export interface ApplyResult {
  effect: Effect;
  /** Replaces this entry's state. */
  state?: unknown;
  /** Facts for oracles and reports, e.g. the marker action or the true and false values. */
  record?: Record<string, unknown>;
}

export interface Haunting<P> {
  id: string;
  family: Family;
  /** Capabilities the proxy must advertise, e.g. "tools.listChanged". */
  requires: readonly string[];
  /** One plan entry (target + params) for this scenario, or null when the haunting cannot apply. */
  entry(ctx: ScenarioContext): fc.Arbitrary<{ target: Target; params: P }> | null;
  /** Pure. Never reads the clock, draws random numbers, performs I/O or mutates its input. */
  apply(input: ApplyInput<P>): ApplyResult;
  /** For frames that do not match the target: should this entry still act (e.g. retries, follow-ups)? */
  follows?(input: ApplyInput<P>): boolean;
  /** Candidates strictly smaller than `p` by `size`. */
  shrinkParams(p: P): P[];
  size(p: P): number;
  /** One plain-language sentence for reports. */
  describe(p: P, target: Target): string;
}

// The catalog holds hauntings with different parameter types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHaunting = Haunting<any>;

export interface AppliedHaunting {
  entryIndex: number;
  haunting: string;
  family: Family;
  seq: number;
  description: string;
  record?: Record<string, unknown>;
}
