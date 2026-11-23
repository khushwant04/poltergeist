import type { Verdict } from "@poltergeist/oracles";

export interface JUnitRun {
  runId: string;
  scenarioId: string;
  seed: number;
  trial: number;
  agent: string;
  verdicts: readonly Verdict[];
}

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // XML 1.0 cannot carry most control characters, even escaped.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

/** One test case per run and applicable oracle; a failing verdict is a <failure>. */
export function toJUnit(suiteName: string, runs: readonly JUnitRun[]): string {
  const cases: string[] = [];
  let tests = 0;
  let failures = 0;
  for (const r of runs) {
    for (const v of r.verdicts.filter((x) => x.applicable)) {
      tests++;
      const classname = esc(`${r.scenarioId}.seed-${r.seed}.trial-${r.trial}`);
      const name = esc(v.oracle);
      if (v.pass) {
        cases.push(`    <testcase classname="${classname}" name="${name}"/>`);
      } else {
        failures++;
        cases.push(
          `    <testcase classname="${classname}" name="${name}">\n      <failure message="${esc(v.reason)}">${esc(
            `run ${r.runId} (${r.agent})\nframes: ${v.evidence.seqs.join(", ")}\n${v.evidence.excerpt}`,
          )}</failure>\n    </testcase>`,
        );
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${tests}" failures="${failures}">\n  <testsuite name="${esc(suiteName)}" tests="${tests}" failures="${failures}">\n${cases.join("\n")}\n  </testsuite>\n</testsuites>\n`;
}
