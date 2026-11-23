import fc from "fast-check";
import type { Haunting } from "../types.js";
import { occurrenceArb } from "./injection-common.js";

/** Never delivers the response, so the agent's call hangs until it times out. */
export const vanish: Haunting<Record<string, never>> = {
  id: "vanish",
  family: "timing",
  requires: [],
  entry(ctx) {
    const tools = [...ctx.scenario.tools].sort();
    return fc
      .record({ tool: fc.constantFrom(...tools), occurrence: occurrenceArb(ctx) })
      .map(({ tool, occurrence }) => ({ target: { method: "tools/call", toolName: tool, occurrence }, params: {} }));
  },
  apply() {
    return { effect: { kind: "drop", cause: { entryIndex: -1, haunting: "vanish" } } };
  },
  shrinkParams: () => [],
  size: () => 1,
  describe: (_p, t) => `Vanish: the response to ${t.toolName ?? t.method} call #${t.occurrence} never arrives`,
};
