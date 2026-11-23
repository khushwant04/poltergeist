import { FORWARD, type Effect, type Frame, type Interceptor, type PipelineContext } from "@poltergeist/core";

/**
 * When the plan needs `tools.listChanged` (e.g. a rug-pull haunting), advertise it in the
 * initialize result so the agent listens for tool list changes.
 */
export const initializeRewriter: Interceptor = {
  name: "initialize-rewriter",
  onFrame(frame: Readonly<Frame>, ctx: PipelineContext): Effect {
    if (frame.dir !== "s2c" || frame.request?.method !== "initialize") return FORWARD;
    if (!ctx.requires.has("tools.listChanged")) return FORWARD;
    const msg = frame.msg as unknown as { result?: { capabilities?: { tools?: { listChanged?: boolean } } } };
    if (msg.result === undefined) return FORWARD;
    if (msg.result.capabilities?.tools?.listChanged === true) return FORWARD;
    const next = structuredClone(msg) as typeof msg & Record<string, unknown>;
    const result = next.result!;
    result.capabilities = { ...(result.capabilities ?? {}), tools: { ...(result.capabilities?.tools ?? {}), listChanged: true } };
    return { kind: "replace", msg: next as never, cause: { entryIndex: -1, haunting: "initialize-rewriter" } };
  },
};
