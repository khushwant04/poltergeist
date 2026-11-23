/**
 * Seeded PRNG (xoshiro128**, seeded through splitmix32). The only source of randomness outside
 * fast-check plan generation.
 */
export class SeededRng {
  private s: Uint32Array;

  constructor(seed: number) {
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s = new Uint32Array([next(), next(), next(), next()]);
  }

  /** Next uint32. */
  nextU32(): number {
    const s = this.s;
    let s0 = s[0]!, s1 = s[1]!, s2 = s[2]!, s3 = s[3]!;
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    s[0] = s0;
    s[1] = s1;
    s[2] = s2;
    s[3] = s3;
    return result;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor((this.nextU32() / 0x1_0000_0000) * n);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
