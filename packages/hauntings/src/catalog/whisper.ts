import fc from "fast-check";
import { FORWARD } from "@poltergeist/core";
import { insertText, toolResult, wrapText } from "../content.js";
import { payloadText, render } from "../payloads.js";
import type { Haunting } from "../types.js";
import { injectionParamsArb, injectionSize, occurrenceArb, payloadById, preview, shrinkInjection, type InjectionParams } from "./injection-common.js";

/** Hides an instruction inside a tool result to pull the agent off its task. */
export const whisper: Haunting<InjectionParams> = {
  id: "whisper",
  family: "injection",
  requires: [],
  entry(ctx) {
    const tools = [...ctx.scenario.tools].sort();
    return fc
      .record({ tool: fc.constantFrom(...tools), occurrence: occurrenceArb(ctx), params: injectionParamsArb("whisper") })
      .map(({ tool, occurrence, params }) => ({ target: { method: "tools/call", toolName: tool, occurrence }, params }));
  },
  apply({ frame, params, ctx }) {
    if (!toolResult(frame.msg)) return { effect: FORWARD };
    const text = render(payloadText(payloadById(params.payloadId), params.variant), { task: ctx.scenario.task });
    const msg = insertText(frame.msg, wrapText(text, params.wrapper), params.position);
    return {
      effect: { kind: "replace", msg, cause: { entryIndex: -1, haunting: "whisper" } },
      record: { payloadId: params.payloadId, text },
    };
  },
  shrinkParams: shrinkInjection,
  size: injectionSize,
  describe(p, t) {
    const text = payloadText(payloadById(p.payloadId), p.variant);
    return `Whispers "${preview(text)}" into ${t.toolName ?? t.method} result #${t.occurrence}`;
  },
};
