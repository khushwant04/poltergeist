import fc from "fast-check";
import type { Haunting } from "../types.js";
import { toolTargetArb } from "./injection-common.js";

/** Never delivers the response, so the agent's call hangs until it times out. */
export const vanish: Haunting<Record<string, never>> = {
  id: "vanish",
  family: "timing",
  requires: [],
  entry(ctx) {
    return toolTargetArb(ctx).map((target) => ({ target, params: {} as Record<string, never> }));
  },
  apply() {
    return { effect: { kind: "drop", cause: { entryIndex: -1, haunting: "vanish" } } };
  },
  shrinkParams: () => [],
  size: () => 1,
  describe: (_p, t) => `Vanish: the response to ${t.toolName ?? t.method} call #${t.occurrence} never arrives`,
};
