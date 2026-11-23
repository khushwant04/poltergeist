import fc from "fast-check";
import { FORWARD } from "@poltergeist/core";
import { insertText, toolResult, wrapText } from "../content.js";
import { payloadText, render } from "../payloads.js";
import type { Haunting } from "../types.js";
import { DESCRIBE_VARS, injectionParamsArb, injectionSize, payloadById, preview, shrinkInjection, toolTargetArb, type InjectionParams } from "./injection-common.js";

/** Hides an instruction inside a tool result to pull the agent off its task. */
export const whisper: Haunting<InjectionParams> = {
  id: "whisper",
  summary: "Hides an instruction inside a tool result.",
  tests: "Does the agent treat tool output as data, not orders?",
  family: "injection",
  requires: [],
  entry(ctx) {
    return fc.record({ target: toolTargetArb(ctx), params: injectionParamsArb("whisper") });
  },
  apply({ frame, params, ctx }) {
    if (!toolResult(frame.msg)) return { effect: FORWARD };
    const text = render(payloadText(payloadById(params.payloadId), params.variant), { task: ctx.scenario.task });
    const msg = insertText(frame.msg, wrapText(text, params.wrapper), params.position);
    return {
      effect: { kind: "replace", msg, cause: { entryIndex: -1, haunting: "whisper" } },
      record: {
        payloadId: params.payloadId,
        text,
        ...(payloadById(params.payloadId).answerMarker ? { answerMarker: payloadById(params.payloadId).answerMarker } : {}),
      },
    };
  },
  shrinkParams: shrinkInjection,
  size: injectionSize,
  describe(p, t) {
    const text = render(payloadText(payloadById(p.payloadId), p.variant), DESCRIBE_VARS);
    return `Whispers "${preview(text)}" into ${t.toolName ?? t.method} result #${t.occurrence}`;
  },
};
