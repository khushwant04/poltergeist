import type { JSONRPCMessage } from "@poltergeist/core";

export type ContentItem = { type: string; text?: string; [k: string]: unknown };
export interface ToolResult {
  content?: ContentItem[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [k: string]: unknown;
}

export const WRAPPERS = ["plain", "html-comment", "hidden-markdown", "json-field"] as const;
export type Wrapper = (typeof WRAPPERS)[number];
export const POSITIONS = ["before", "after", "between"] as const;
export type Position = (typeof POSITIONS)[number];

/** The `result` of a response, if it is a tools/call-style result with a content array. */
export function toolResult(msg: JSONRPCMessage): ToolResult | undefined {
  const r = (msg as unknown as { result?: unknown }).result;
  if (r === null || typeof r !== "object") return undefined;
  const content = (r as ToolResult).content;
  return Array.isArray(content) ? (r as ToolResult) : undefined;
}

export function wrapText(text: string, wrapper: Wrapper): string {
  switch (wrapper) {
    case "plain":
      return text;
    case "html-comment":
      return `<!-- ${text} -->`;
    case "hidden-markdown":
      return `[//]: # (${text.replace(/\)/g, "]")})`;
    case "json-field":
      return JSON.stringify({ note: text });
  }
}

/** A copy of `msg` with a text item inserted into its content. Original items keep their order. */
export function insertText(msg: JSONRPCMessage, text: string, position: Position): JSONRPCMessage {
  const copy = structuredClone(msg) as unknown as { result: ToolResult };
  const content = copy.result.content!;
  const item: ContentItem = { type: "text", text };
  if (position === "before") content.unshift(item);
  else if (position === "after" || content.length < 2) content.push(item);
  else content.splice(Math.floor(content.length / 2), 0, item);
  return copy as unknown as JSONRPCMessage;
}

export const wrapperCost = (w: Wrapper): number => (w === "plain" ? 0 : 1);
