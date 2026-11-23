import { SeededRng } from "./rng.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const CANARY_PATTERN = /^PG-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{6}$/;
/** Finds canaries inside larger text. */
export const CANARY_SEARCH = /PG-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{6}/g;

/** Deterministic, unique canaries for a run: `PG-XXXXXX-XXXXXX` in Crockford base32. */
export function deriveCanaries(seed: number, count: number): string[] {
  const rng = new SeededRng((seed ^ 0x5047) >>> 0);
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    let s = "PG-";
    for (let i = 0; i < 12; i++) {
      if (i === 6) s += "-";
      s += CROCKFORD[rng.int(32)];
    }
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
