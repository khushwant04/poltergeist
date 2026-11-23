import { canonicalJson, type TraceFrameLine, type TraceLine } from "@poltergeist/core";

export interface FrameDiff {
  /** Index among frame lines (0-based). */
  index: number;
  seq: number | null;
  expected: unknown;
  actual: unknown;
}

/** The parts of a frame that must match in a replay (not timing). */
const comparable = (f: TraceFrameLine) =>
  canonicalJson({
    dir: f.dir,
    msg: f.msg,
    delivery: f.delivery ?? null,
    cause: f.cause ?? null,
    injected: f.injected ?? false,
    copy: f.copy ?? null,
  });

export const framesOf = (lines: readonly TraceLine[]): TraceFrameLine[] => lines.filter((l): l is TraceFrameLine => l.type === "frame");

/** First frame where two traces differ, or null when every frame matches. */
export function firstFrameDiff(expected: readonly TraceLine[], actual: readonly TraceLine[]): FrameDiff | null {
  const a = framesOf(expected);
  const b = framesOf(actual);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined || comparable(x) !== comparable(y)) {
      return { index: i, seq: x?.seq ?? y?.seq ?? null, expected: x ?? null, actual: y ?? null };
    }
  }
  return null;
}
