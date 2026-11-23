export interface GateInput {
  score: number;
  minScore?: number;
  maxDrop?: number;
  baseline?: number;
}

/** Exit code for CI: 1 when the score is below the minimum or dropped more than allowed against the baseline. */
export function gate({ score, minScore, maxDrop, baseline }: GateInput): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (minScore !== undefined && score < minScore) reasons.push(`score ${score} is below the minimum ${minScore}`);
  if (maxDrop !== undefined && baseline !== undefined && baseline - score > maxDrop) {
    reasons.push(`score dropped ${Math.round((baseline - score) * 10) / 10} points from the baseline ${baseline} (allowed ${maxDrop})`);
  }
  return { pass: reasons.length === 0, reasons };
}
