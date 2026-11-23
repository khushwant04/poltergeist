import {
  FORWARD,
  type Clock,
  type Direction,
  type Effect,
  type Frame,
  type Interceptor,
  type JSONRPCMessage,
  type PipelineContext,
  type RequestContext,
} from "@poltergeist/core";
import { classify } from "./classify.js";
import { Correlator } from "./correlator.js";
import { OccurrenceCounter } from "./occurrence.js";

export interface PipelineEvent {
  name: "interceptor_error";
  detail: Record<string, unknown>;
}

export interface PipelineResult {
  /** The frame as it will be delivered (msg may be replaced). */
  frame: Frame;
  /** The message as it arrived, when an interceptor replaced it. */
  original?: JSONRPCMessage;
  /** The effect to execute for delivery. `replace` is already folded into `frame.msg`. */
  effect: Effect;
  /** The replace effect that changed the message, if any. */
  replacedBy?: Extract<Effect, { kind: "replace" }>;
}

/**
 * Assigns seq numbers, attaches request context and occurrence, and folds interceptors.
 * `replace` effects chain (later interceptors see the replaced frame); any other non-forward
 * effect ends the fold. An interceptor that throws is skipped and reported.
 */
export class Pipeline {
  private seq = 0;
  private readonly start: number;
  readonly correlator = new Correlator();
  private readonly occurrences = new OccurrenceCounter();

  constructor(
    private readonly interceptors: readonly Interceptor[],
    private readonly clock: Clock,
    private readonly ctx: PipelineContext,
    private readonly onEvent: (e: PipelineEvent) => void = () => {},
  ) {
    this.start = clock.now();
  }

  nextSeq(): number {
    return ++this.seq;
  }

  elapsed(): number {
    return this.clock.now() - this.start;
  }

  process(dir: Direction, msg: JSONRPCMessage): PipelineResult {
    const c = classify(msg);
    const frame: Frame = { seq: this.nextSeq(), dir, t: this.elapsed(), msg, kind: c.kind };

    if (c.kind === "request") {
      const name = c.params?.["name"];
      const toolName = c.method === "tools/call" && typeof name === "string" ? name : undefined;
      const occurrence = this.occurrences.next(c.method, toolName);
      const request: RequestContext = { id: c.id, dir, method: c.method, occurrence };
      if (toolName !== undefined) {
        request.toolName = toolName;
        request.args = c.params?.["arguments"];
      }
      this.correlator.track(request);
      frame.request = request;
      frame.occurrence = occurrence;
    } else if (c.kind === "response") {
      const { request, orphan } = this.correlator.resolve(dir, c.id);
      if (request) {
        frame.request = request;
        frame.occurrence = request.occurrence;
      }
      if (orphan) frame.orphan = true;
    }

    let current: Frame = frame;
    let original: JSONRPCMessage | undefined;
    let replacedBy: Extract<Effect, { kind: "replace" }> | undefined;

    for (const interceptor of this.interceptors) {
      let effect: Effect;
      try {
        effect = interceptor.onFrame(deepFreeze(structuredClone(current)), this.ctx);
      } catch (err) {
        this.onEvent({
          name: "interceptor_error",
          detail: { interceptor: interceptor.name, seq: frame.seq, error: String(err) },
        });
        continue;
      }
      if (effect.kind === "forward") continue;
      if (effect.kind === "replace") {
        original ??= msg;
        replacedBy = effect;
        current = { ...current, msg: effect.msg };
        continue;
      }
      return finish(current, effect, original, replacedBy);
    }
    return finish(current, FORWARD, original, replacedBy);
  }
}

function finish(
  frame: Frame,
  effect: Effect,
  original: JSONRPCMessage | undefined,
  replacedBy: Extract<Effect, { kind: "replace" }> | undefined,
): PipelineResult {
  const r: PipelineResult = { frame, effect };
  if (original !== undefined) r.original = original;
  if (replacedBy !== undefined) r.replacedBy = replacedBy;
  return r;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
