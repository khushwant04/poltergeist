import type { Clock, Direction, Effect, Frame, HauntingRef, JSONRPCMessage, TraceLine } from "@poltergeist/core";
import type { PipelineResult } from "./pipeline.js";

type Delivery = "sent" | "delayed" | "dropped" | "held";

export interface ExecutorDeps {
  clock: Clock;
  nextSeq: () => number;
  elapsed: () => number;
  deliver: (dir: Direction, msg: JSONRPCMessage) => void;
  record: (line: TraceLine) => void;
  holdTimeoutMs?: number;
}

/**
 * Performs effects. This is the only place that touches time. Every trace frame line is written
 * when its seq is allocated, so seq numbers are strictly increasing in trace order.
 */
export class EffectExecutor {
  private held: Array<{ dir: Direction; msg: JSONRPCMessage; timer: ReturnType<Clock["setTimeout"]> }> = [];
  private readonly holdTimeoutMs: number;

  constructor(private readonly deps: ExecutorDeps) {
    this.holdTimeoutMs = deps.holdTimeoutMs ?? 10_000;
  }

  execute(result: PipelineResult): void {
    this.run(result.frame, result.effect, result);
  }

  private run(frame: Frame, effect: Effect, result: PipelineResult): void {
    const { deps } = this;
    switch (effect.kind) {
      case "forward":
      case "replace": {
        this.writeFrame(frame, result, "sent");
        this.send(frame.dir, frame.msg, frame.kind === "response");
        return;
      }
      case "delay": {
        this.writeFrame(frame, result, "delayed", effect.cause);
        deps.clock.setTimeout(() => this.send(frame.dir, frame.msg, frame.kind === "response"), effect.ms);
        return;
      }
      case "drop": {
        this.writeFrame(frame, result, "dropped", effect.cause);
        return;
      }
      case "duplicate": {
        this.writeFrame(frame, result, "sent", effect.cause);
        this.send(frame.dir, frame.msg, frame.kind === "response");
        for (let i = 1; i <= effect.copies; i++) {
          deps.clock.setTimeout(() => {
            deps.record({
              type: "frame",
              seq: deps.nextSeq(),
              dir: frame.dir,
              t: deps.elapsed(),
              msg: frame.msg as never,
              cause: effect.cause,
              copy: i,
              delivery: "sent",
              ...requestFields(frame),
            });
            this.send(frame.dir, frame.msg, false);
          }, effect.gapMs * i);
        }
        return;
      }
      case "hold": {
        this.writeFrame(frame, result, "held", effect.cause);
        const entry = {
          dir: frame.dir,
          msg: frame.msg,
          timer: deps.clock.setTimeout(() => {
            if (!this.held.includes(entry)) return;
            this.held = this.held.filter((h) => h !== entry);
            deps.record({ type: "event", t: deps.elapsed(), name: "hold_timeout", detail: { seq: frame.seq } });
            this.send(entry.dir, entry.msg, false);
          }, this.holdTimeoutMs),
        };
        this.held.push(entry);
        return;
      }
      case "inject": {
        this.run(frame, effect.then, result);
        deps.record({
          type: "frame",
          seq: deps.nextSeq(),
          dir: "s2c",
          t: deps.elapsed(),
          msg: effect.msg as never,
          cause: effect.cause,
          injected: true,
          delivery: "sent",
        });
        this.send("s2c", effect.msg, false);
        return;
      }
    }
  }

  private send(dir: Direction, msg: JSONRPCMessage, releasesHeld: boolean): void {
    this.deps.deliver(dir, msg);
    if (releasesHeld && dir === "s2c" && this.held.length > 0) {
      const release = this.held;
      this.held = [];
      for (const h of release) {
        this.deps.clock.clearTimeout(h.timer);
        this.deps.deliver(h.dir, h.msg);
      }
    }
  }

  private writeFrame(frame: Frame, result: PipelineResult, delivery: Delivery, cause?: HauntingRef): void {
    const c = cause ?? result.replacedBy?.cause;
    this.deps.record({
      type: "frame",
      seq: frame.seq,
      dir: frame.dir,
      t: frame.t,
      msg: frame.msg as never,
      ...(result.original !== undefined ? { original: result.original as never } : {}),
      ...(c !== undefined ? { cause: c } : {}),
      delivery,
      ...requestFields(frame),
    });
  }
}

function requestFields(frame: Frame): { occurrence?: number; method?: string; toolName?: string } {
  const out: { occurrence?: number; method?: string; toolName?: string } = {};
  if (frame.occurrence !== undefined) out.occurrence = frame.occurrence;
  if (frame.request?.method !== undefined) out.method = frame.request.method;
  if (frame.request?.toolName !== undefined) out.toolName = frame.request.toolName;
  return out;
}
