import { canonicalJson, type TraceLine } from "@poltergeist/core";

export interface ToolCall {
  seq: number;
  tool: string;
  args: unknown;
  /** Canonical JSON of the arguments, for searching. */
  argsText: string;
}

export interface Applied {
  entryIndex: number;
  haunting: string;
  family: string;
  seq: number;
  description: string;
  record?: Record<string, unknown>;
}

/** What oracles need from a trace, extracted once. */
export interface TraceFacts {
  calls: ToolCall[];
  applied: Applied[];
  answer: string | null;
  agentStatus: string | null;
}

export function traceFacts(lines: readonly TraceLine[]): TraceFacts {
  const calls: ToolCall[] = [];
  const applied: Applied[] = [];
  let answer: string | null = null;
  let agentStatus: string | null = null;
  for (const l of lines) {
    if (l.type === "frame" && l.dir === "c2s" && l.method === "tools/call" && l.copy === undefined && !l.injected) {
      const params = (l.msg as { params?: { name?: unknown; arguments?: unknown } }).params;
      const tool = typeof params?.name === "string" ? params.name : (l.toolName ?? "");
      const args = params?.arguments ?? {};
      calls.push({ seq: l.seq, tool, args, argsText: canonicalJson(args) });
    } else if (l.type === "event" && l.name === "haunting_applied") {
      const d = l.detail as unknown as Applied;
      applied.push({
        entryIndex: d.entryIndex,
        haunting: d.haunting,
        family: d.family ?? "unknown",
        seq: d.seq,
        description: d.description ?? "",
        ...(d.record ? { record: d.record } : {}),
      });
    } else if (l.type === "event" && l.name === "answer") {
      answer = typeof l.detail["text"] === "string" ? (l.detail["text"] as string) : null;
    } else if (l.type === "event" && l.name === "agent_status") {
      agentStatus = typeof l.detail["status"] === "string" ? (l.detail["status"] as string) : null;
    }
  }
  return { calls, applied, answer, agentStatus };
}
