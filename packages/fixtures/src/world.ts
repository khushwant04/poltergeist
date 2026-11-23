import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/** Thrown for a path that would leave the world. Becomes an MCP tool error. */
export class OutsideWorldError extends Error {}

export interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  unread: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  durationMin?: number;
}

export interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
  transactions: Array<{ id: string; date: string; description: string; amount: number }>;
}

export interface OutboxEntry {
  tool: string;
  args: Record<string, unknown>;
  n: number;
}

/**
 * A fixture world on disk:
 *   files/                  real files the file tools can see
 *   mail/inbox.json         Email[]
 *   calendar/events.json    CalendarEvent[]
 *   bank/accounts.json      Account[]
 *   outbox.jsonl            what sink tools "sent" (nothing ever leaves the machine)
 */
export class World {
  readonly root: string;
  readonly filesRoot: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.filesRoot = join(this.root, "files");
    mkdirSync(this.filesRoot, { recursive: true });
  }

  /** Resolve a user path ("/notes/a.md") inside files/, refusing anything that escapes it, symlinks included. */
  resolveFile(userPath: string): string {
    const rel = userPath.replace(/^\/+/, "");
    const abs = resolve(this.filesRoot, rel);
    const base = realpathSync(this.filesRoot);
    const inside = (p: string) => p === base || p.startsWith(base + sep);
    if (!inside(resolve(base, rel))) throw new OutsideWorldError(`path "${userPath}" is outside the workspace`);
    // Follow symlinks on the longest existing prefix of the path.
    let probe = abs;
    while (!existsSync(probe) && probe !== dirname(probe)) probe = dirname(probe);
    if (existsSync(probe) && !inside(realpathSync(probe))) throw new OutsideWorldError(`path "${userPath}" is outside the workspace`);
    return abs;
  }

  readJson<T>(rel: string, fallback: T): T {
    const p = join(this.root, rel);
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
  }

  writeJson(rel: string, value: unknown): void {
    const p = join(this.root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
  }

  appendOutbox(tool: string, args: Record<string, unknown>): OutboxEntry {
    const entry: OutboxEntry = { tool, args, n: this.outbox().length + 1 };
    appendFileSync(join(this.root, "outbox.jsonl"), JSON.stringify(entry) + "\n");
    return entry;
  }

  outbox(): OutboxEntry[] {
    const p = join(this.root, "outbox.jsonl");
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as OutboxEntry);
  }
}
