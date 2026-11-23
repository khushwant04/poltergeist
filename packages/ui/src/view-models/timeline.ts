import type { BundleFrame, RunBundle } from "@poltergeist/core";
import { hauntingLabel } from "./labels.js";

export interface TimelineRow {
  seq: number;
  t: number;
  dir: "c2s" | "s2c";
  kind: "request" | "response" | "notification" | "other";
  /** "tools/call read_email #2", "initialize", … */
  label: string;
  delivery: NonNullable<BundleFrame["delivery"]>;
  haunting?: { id: string; name: string; plain: string; entryIndex: number };
  injected: boolean;
  copy?: number;
  isError: boolean;
  preview: string;
  frame: BundleFrame;
}

type Obj = Record<string, unknown>;

function kindOf(msg: Obj): TimelineRow["kind"] {
  if (typeof msg["method"] === "string") return msg["id"] !== undefined ? "request" : "notification";
  if (msg["id"] !== undefined && ("result" in msg || "error" in msg)) return "response";
  return "other";
}

/** A short, single-line description of what a message says. */
export function previewOf(msg: Obj): string {
  if ("error" in msg) return `error: ${String((msg["error"] as Obj | undefined)?.["message"] ?? "")}`;
  const result = msg["result"] as Obj | undefined;
  if (result && Array.isArray(result["content"])) {
    const text = (result["content"] as Obj[])
      .map((c) => (typeof c["text"] === "string" ? (c["text"] as string) : `[${String(c["type"])}]`))
      .join(" · ");
    return text.replace(/\s+/g, " ").slice(0, 160);
  }
  if (result && Array.isArray(result["tools"])) return `${(result["tools"] as unknown[]).length} tools`;
  const params = msg["params"] as Obj | undefined;
  if (params && params["arguments"] !== undefined) return JSON.stringify(params["arguments"]).slice(0, 160);
  return "";
}

/** One row per frame, in seq order. A haunting badge appears exactly on frames with a cause. */
export function toTimelineRows(bundle: Pick<RunBundle, "frames">): TimelineRow[] {
  return [...bundle.frames]
    .sort((a, b) => a.seq - b.seq)
    .map((f) => {
      const msg = f.msg as unknown as Obj;
      const kind = kindOf(msg);
      const method = f.method ?? (typeof msg["method"] === "string" ? (msg["method"] as string) : kind === "response" ? "response" : "message");
      const label = `${method}${f.toolName ? ` ${f.toolName}` : ""}${f.occurrence !== undefined && f.toolName ? ` #${f.occurrence}` : ""}`;
      const result = msg["result"] as Obj | undefined;
      const row: TimelineRow = {
        seq: f.seq,
        t: f.t,
        dir: f.dir,
        kind,
        label,
        delivery: f.delivery ?? "sent",
        injected: f.injected === true,
        isError: "error" in msg || result?.["isError"] === true,
        preview: previewOf(msg),
        frame: f,
      };
      if (f.cause) {
        const l = hauntingLabel(f.cause.haunting);
        row.haunting = { id: f.cause.haunting, name: l.name, plain: l.plain, entryIndex: f.cause.entryIndex };
      }
      if (f.copy !== undefined) row.copy = f.copy;
      return row;
    });
}
