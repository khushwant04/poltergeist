import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { TraceLine } from "@poltergeist/core";

export interface TraceSink {
  write(line: TraceLine): void;
  close(): void;
}

export interface RedactionOptions {
  /** Regular expressions whose matches are replaced with "[redacted]". */
  patterns?: readonly RegExp[];
  /** Literal secret values to redact. */
  secrets?: readonly string[];
  /** Strings that must never be redacted (canaries are evidence). */
  keep?: readonly string[];
}

export const REDACTED = "[redacted]";

/** Redact every string value in `value` (keys are left alone). Returns a new value. */
export function redactValue(value: unknown, opts: RedactionOptions): unknown {
  const patterns = opts.patterns ?? [];
  const secrets = (opts.secrets ?? []).filter((s) => s.length > 0);
  const keep = (opts.keep ?? []).filter((s) => s.length > 0);
  if (patterns.length === 0 && secrets.length === 0) return value;

  const redactString = (s: string): string => {
    // Protect kept strings with placeholders that no pattern can match, redact, then restore.
    const placeholders: string[] = [];
    let out = s;
    keep.forEach((k, i) => {
      if (out.includes(k)) {
        const ph = `\u0000KEEP${i}\u0000`;
        placeholders[i] = ph;
        out = out.split(k).join(ph);
      }
    });
    for (const secret of secrets) out = out.split(secret).join(REDACTED);
    for (const p of patterns) {
      const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
      out = out.replace(re, (m) => (m.includes("\u0000") ? m : REDACTED));
    }
    keep.forEach((k, i) => {
      const ph = placeholders[i];
      if (ph !== undefined) out = out.split(ph).join(k);
    });
    return out;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return redactString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(value);
}

/** Append-only JSONL trace writer. Each line is written synchronously so a crash loses nothing written. */
export class FileTraceSink implements TraceSink {
  private fd: number | null;

  constructor(
    readonly path: string,
    private readonly redaction: RedactionOptions = {},
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.fd = openSync(path, "a");
  }

  write(line: TraceLine): void {
    if (this.fd === null) return;
    const safe = redactValue(line, this.redaction);
    writeSync(this.fd, JSON.stringify(safe) + "\n");
  }

  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }
}

/** Keeps lines in memory (tests, live view). */
export class MemoryTraceSink implements TraceSink {
  readonly lines: TraceLine[] = [];
  constructor(private readonly redaction: RedactionOptions = {}) {}
  write(line: TraceLine): void {
    this.lines.push(redactValue(line, this.redaction) as TraceLine);
  }
  close(): void {}
}

export class NullTraceSink implements TraceSink {
  write(): void {}
  close(): void {}
}
