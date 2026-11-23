import { PoltergeistError } from "@poltergeist/core";
import { fakeAgent } from "./fake.js";
import { referenceAgent, type ReferenceAgentOptions } from "./reference.js";
import type { AgentAdapter } from "./types.js";

/** Rebuild an agent from the name recorded in a trace, e.g. "fake(falls-for:possession)" or "reference(hardened)". */
export function agentFromName(name: string, opts: { createMessage?: ReferenceAgentOptions["createMessage"] } = {}): AgentAdapter {
  const fake = /^fake(?:\(falls-for:([a-z+-]+)\))?$/.exec(name);
  if (fake) return fakeAgent({ fallFor: fake[1] ? fake[1].split("+") : [] });
  const ref = /^reference\((default|hardened)\)$/.exec(name);
  if (ref) return referenceAgent({ prompt: ref[1] as "default" | "hardened", ...(opts.createMessage ? { createMessage: opts.createMessage } : {}) });
  throw new PoltergeistError("invalid_input", `cannot rebuild agent "${name}"; only fake and reference agents can be replayed or shrunk`);
}
