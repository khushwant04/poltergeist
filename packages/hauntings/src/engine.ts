import {
  FORWARD,
  PoltergeistError,
  type Effect,
  type Frame,
  type HauntingRef,
  type Interceptor,
  type Plan,
  type ScenarioContext,
} from "@poltergeist/core";
import { CATALOG, type Catalog } from "./catalog/index.js";
import type { AppliedHaunting } from "./types.js";

/**
 * Applies a plan to live traffic. Matching entries apply in plan order: replacements chain,
 * injected messages are collected, and drop/delay/duplicate/hold end the chain.
 */
export class HauntingEngine implements Interceptor {
  readonly name = "haunting-engine";
  readonly applied: AppliedHaunting[] = [];
  private readonly states = new Map<number, unknown>();
  private readonly fired = new Set<number>();

  constructor(
    readonly plan: Plan,
    private readonly ctx: ScenarioContext,
    private readonly catalog: Catalog = CATALOG,
    private readonly onApplied: (a: AppliedHaunting) => void = () => {},
  ) {
    plan.entries.forEach((e, i) => {
      if (!catalog.byId.has(e.haunting)) {
        throw new PoltergeistError("invalid_input", `plan entry ${i} uses unknown haunting "${e.haunting}"`);
      }
    });
    if (plan.catalogVersion !== catalog.version) {
      throw new PoltergeistError(
        "invalid_input",
        `plan was made for catalog version ${plan.catalogVersion}, but this build has ${catalog.version}`,
        "Regenerate the plan from its seed.",
      );
    }
  }

  onFrame(frame: Readonly<Frame>): Effect {
    if (frame.dir !== "s2c" || frame.kind !== "response" || frame.request === undefined) return FORWARD;
    const request = frame.request;

    let current: Readonly<Frame> = frame;
    let replacedBy: HauntingRef | undefined;
    let terminal: Effect | undefined;
    const injects: Array<Extract<Effect, { kind: "inject" }>> = [];

    for (let i = 0; i < this.plan.entries.length && terminal === undefined; i++) {
      const entry = this.plan.entries[i]!;
      const h = this.catalog.byId.get(entry.haunting)!;
      const input = { frame: current, params: entry.params, ctx: this.ctx, state: this.states.get(i), entryIndex: i };
      const t = entry.target;
      const onTarget =
        request.method === t.method &&
        (t.toolName === undefined || request.toolName === t.toolName) &&
        frame.occurrence === t.occurrence &&
        this.states.get(i) === undefined;
      if (!onTarget && !(h.follows?.(input) ?? false)) continue;

      const result = h.apply(input);
      if (result.state !== undefined) this.states.set(i, result.state);
      const effect = result.effect;
      if (effect.kind === "forward") continue;

      const cause: HauntingRef = { entryIndex: i, haunting: h.id };
      this.fired.add(i);
      const applied: AppliedHaunting = {
        entryIndex: i,
        haunting: h.id,
        family: h.family,
        seq: frame.seq,
        description: h.describe(entry.params, t),
        ...(result.record !== undefined ? { record: result.record } : {}),
      };
      this.applied.push(applied);
      this.onApplied(applied);

      if (effect.kind === "replace") {
        current = { ...current, msg: effect.msg };
        replacedBy = cause;
      } else if (effect.kind === "inject") {
        injects.push({ ...effect, cause });
        if (effect.then.kind === "replace") {
          current = { ...current, msg: effect.then.msg };
          replacedBy = cause;
        } else if (effect.then.kind !== "forward") {
          terminal = { ...effect.then, cause } as Effect;
        }
      } else {
        terminal = { ...effect, cause } as Effect;
      }
    }

    const changed = current.msg !== frame.msg;
    let out: Effect;
    if (terminal !== undefined) {
      out =
        changed && (terminal.kind === "delay" || terminal.kind === "duplicate" || terminal.kind === "hold")
          ? { ...terminal, msg: current.msg }
          : terminal;
    } else if (changed && replacedBy !== undefined) {
      out = { kind: "replace", msg: current.msg, cause: replacedBy };
    } else {
      out = FORWARD;
    }
    for (const inj of injects.reverse()) out = { kind: "inject", msg: inj.msg, then: out, cause: inj.cause };
    return out;
  }

  /** Entry indexes that never fired. */
  unfired(): number[] {
    return this.plan.entries.map((_, i) => i).filter((i) => !this.fired.has(i));
  }
}
