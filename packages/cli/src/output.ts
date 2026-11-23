import type { Verdict } from "@poltergeist/oracles";

/** Command results go to stdout (these commands are not MCP servers). */
export const print = (s: string): void => void process.stdout.write(s.endsWith("\n") ? s : `${s}\n`); // lint-allow

export function verdictLines(verdicts: readonly Verdict[]): string[] {
  return verdicts.map((v) => {
    const mark = !v.applicable ? "  -  " : v.pass ? " pass" : " FAIL";
    return `   ${mark}  ${v.oracle.padEnd(20)} ${v.reason}`;
  });
}
