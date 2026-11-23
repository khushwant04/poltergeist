export type DiffOp = { op: "eq" | "del" | "add"; line: string };

/**
 * Make a message readable: tool results are often JSON inside a string, and injected text is often
 * multi-line. Expand both so a diff shows the changed lines, not one escaped blob.
 */
export function readable(v: unknown): unknown {
  if (typeof v === "string") {
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return readable(JSON.parse(t));
      } catch {
        // not JSON after all
      }
    }
    return v.includes("\n") ? v.split("\n") : v;
  }
  if (Array.isArray(v)) return v.map(readable);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, readable(x)]));
  return v;
}

/** Pretty JSON with sorted keys (after `readable`), so diffs show real changes rather than key order. */
export function prettyLines(value: unknown): string[] {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  // Long strings are split on their own line breaks so injected text stands out.
  return (JSON.stringify(sort(readable(value)), null, 2) ?? "null").split("\n");
}

const MAX_CELLS = 4_000_000;

/** Line diff (longest common subsequence) between two messages. */
export function messageDiff(before: unknown, after: unknown): DiffOp[] {
  const a = prettyLines(before);
  const b = prettyLines(after);
  if (a.length * b.length > MAX_CELLS) return [...a.map((line) => ({ op: "del" as const, line })), ...b.map((line) => ({ op: "add" as const, line }))];
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "eq", line: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ op: "del", line: a[i++]! });
    } else {
      ops.push({ op: "add", line: b[j++]! });
    }
  }
  while (i < n) ops.push({ op: "del", line: a[i++]! });
  while (j < m) ops.push({ op: "add", line: b[j++]! });
  return ops;
}

/** Rebuild the "after" side from a diff (and the "before" side with `side: "before"`). */
/** Display groups: changes, with long unchanged stretches folded except for `context` lines around them. */
export type DiffGroup = { kind: "lines"; ops: DiffOp[] } | { kind: "fold"; count: number };

export function foldDiff(ops: readonly DiffOp[], context = 3): DiffGroup[] {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.op === "eq") return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) keep[j] = true;
  });
  const out: DiffGroup[] = [];
  let i = 0;
  while (i < ops.length) {
    if (keep[i]) {
      const lines: DiffOp[] = [];
      while (i < ops.length && keep[i]) lines.push(ops[i++]!);
      out.push({ kind: "lines", ops: lines });
    } else {
      let count = 0;
      while (i < ops.length && !keep[i]) {
        count++;
        i++;
      }
      out.push({ kind: "fold", count });
    }
  }
  return out;
}

export function applyDiff(ops: readonly DiffOp[], side: "before" | "after" = "after"): string[] {
  return ops.filter((o) => o.op === "eq" || o.op === (side === "after" ? "add" : "del")).map((o) => o.line);
}
