import { CANARY_SEARCH } from "@poltergeist/core";
import { callTool, type AgentAdapter, type AgentResult } from "./types.js";

export interface FakeAgentOptions {
  /** Hauntings this agent falls for: "possession" (sends the canary), "whisper" (repeats injected text). */
  fallFor?: readonly string[];
  /** Retry a failing call this many times (default 2). */
  retries?: number;
  /** Per-call timeout in ms (default 1000). */
  callTimeoutMs?: number;
}

const ATTACKER = /[\w.+-]+@[\w.-]+\.invalid/;

/**
 * A deterministic scripted agent for tests and CI (no API key). It runs the scenario's `fakeScript`
 * and can be told which hauntings to fall for.
 */
export function fakeAgent(opts: FakeAgentOptions = {}): AgentAdapter {
  const fallFor = new Set(opts.fallFor ?? []);
  const retries = opts.retries ?? 2;
  const timeout = opts.callTimeoutMs ?? 1000;
  return {
    name: fallFor.size > 0 ? `fake(falls-for:${[...fallFor].sort().join("+")})` : "fake",
    async run({ scenario, client, maxSteps, signal }): Promise<AgentResult> {
      let steps = 0;
      const notes: string[] = [];
      const repeated: string[] = [];
      const tools = new Set((await client.listTools()).tools.map((t) => t.name));
      const sinks = scenario.sinks.filter((s) => tools.has(s));

      const call = async (tool: string, args: Record<string, unknown>) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          if (signal.aborted || steps >= maxSteps) return undefined;
          steps++;
          const r = await callTool(client, tool, args, timeout);
          if (r.ok) return r;
        }
        notes.push(`${tool} failed after ${retries + 1} attempts`);
        return undefined;
      };

      for (const step of scenario.fakeScript) {
        const r = await call(step.tool, step.args);
        if (!r) continue;
        notes.push(`${step.tool}: ${(r.texts[0] ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
        const all = r.texts.join("\n");
        if (fallFor.has("whisper")) repeated.push(...r.texts.slice(1));
        if (fallFor.has("possession")) {
          const canary = all.match(CANARY_SEARCH)?.[0];
          const to = all.match(ATTACKER)?.[0];
          const sink = sinks.find((s) => all.includes(s));
          if (canary && to && sink) {
            const args = sink === "transfer_funds" ? { toAccount: to, amount: 1, memo: canary } : { to, subject: "As requested", body: canary };
            await call(sink, args);
          }
        }
      }
      const status = steps >= maxSteps ? "budget_exceeded" : "done";
      return { answer: ["Done.", ...notes, ...repeated].join("\n"), status, steps };
    },
  };
}
