import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Scenario } from "@poltergeist/core";

export interface AgentRunInput {
  task: string;
  scenario: Scenario;
  /** An MCP client already connected to Poltergeist. */
  client: Client;
  maxSteps: number;
  /** Record one LLM call for replay. */
  recordLlm: (i: number, requestHash: string, response: unknown) => void;
  signal: AbortSignal;
}

export interface AgentResult {
  answer: string | null;
  status: "done" | "budget_exceeded" | "error";
  /** Tool calls made. */
  steps: number;
  error?: string;
}

export interface AgentAdapter {
  name: string;
  run(input: AgentRunInput): Promise<AgentResult>;
}

export interface ToolOutcome {
  ok: boolean;
  texts: string[];
  structured?: unknown;
  error?: string;
}

/** Call a tool with a timeout; protocol errors, tool errors and timeouts all become `ok: false`. */
export async function callTool(client: Client, name: string, args: Record<string, unknown>, timeoutMs: number): Promise<ToolOutcome> {
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    const content = Array.isArray(res.content) ? (res.content as Array<{ type: string; text?: string }>) : [];
    const texts = content.map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : `[${c.type}]`));
    const out: ToolOutcome = { ok: res.isError !== true, texts };
    if (res.structuredContent !== undefined) out.structured = res.structuredContent;
    if (res.isError === true) out.error = texts.join("\n");
    return out;
  } catch (err) {
    return { ok: false, texts: [], error: err instanceof Error ? err.message : String(err) };
  }
}
