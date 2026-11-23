import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { EXIT, PoltergeistError, createLogger } from "@poltergeist/core";
import {
  fakeAgent,
  gate,
  judgeFromEnv,
  loadScenario,
  loadSuite,
  referenceAgent,
  runScenario,
  runSuite,
  toJUnit,
  type AgentAdapter,
  type RunResult,
  type Suite,
} from "@poltergeist/runner";
import { print, verdictLines } from "./output.js";
import { parseSeed } from "./scenario.js";

export interface RunCommandOptions {
  scenario?: string;
  suite?: string;
  agent?: string;
  fallFor?: string;
  seed: string;
  trials: string;
  junit?: string;
  json?: string;
  minScore?: string;
  maxDrop?: string;
  baseline?: string;
  writeBaseline?: string;
  home?: string;
  timeout?: string;
  quiet?: boolean;
}

export function makeAgent(name: string, fallFor?: string): AgentAdapter {
  switch (name) {
    case "fake":
      return fakeAgent({ fallFor: fallFor ? fallFor.split(",").map((s) => s.trim()).filter(Boolean) : [] });
    case "reference":
      return referenceAgent({ prompt: "default" });
    case "reference-hardened":
      return referenceAgent({ prompt: "hardened" });
    default:
      throw new PoltergeistError("invalid_input", `unknown agent "${name}" (use fake, reference or reference-hardened)`);
  }
}

const num = (v: string | undefined, flag: string): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new PoltergeistError("invalid_input", `${flag} must be a number, got "${v}"`);
  return n;
};

function describeRun(r: RunResult, quiet: boolean): string[] {
  const head = `${r.scenarioId.padEnd(18)} seed ${String(r.seed).padEnd(6)} trial ${r.trial}  score ${String(r.score.score).padStart(5)}${r.score.capped ? " (leak cap)" : ""}  ${r.agentResult.status}  run ${r.runId}`;
  if (quiet) return [head];
  const hauntings = r.plan.entries.map((e) => e.haunting).join(", ") || "none";
  return [head, `     hauntings: ${hauntings}`, ...verdictLines(r.verdicts.filter((v) => v.applicable))];
}

/** `poltergeist run`: run a scenario or a suite and judge it. Returns the exit code. */
export async function runRun(opts: RunCommandOptions): Promise<number> {
  const logger = createLogger("info");
  try {
    if ((opts.scenario === undefined) === (opts.suite === undefined)) {
      throw new PoltergeistError("invalid_input", "give exactly one of --scenario or --suite");
    }
    const seed = parseSeed(opts.seed);
    const trials = Number(opts.trials);
    if (!Number.isInteger(trials) || trials < 1 || trials > 20) throw new PoltergeistError("invalid_input", "--trials must be from 1 to 20");
    const suite: Suite = opts.suite
      ? loadSuite(opts.suite)
      : { name: opts.scenario!, runs: [{ scenario: opts.scenario!, seeds: [seed], trials }] };
    loadScenario(suite.runs[0]!.scenario); // fail fast on a bad scenario
    const agent = makeAgent(opts.agent ?? suite.agent ?? "fake", opts.fallFor);
    const judge = judgeFromEnv();
    if (!judge) logger.info("no judge configured (ANTHROPIC_API_KEY + POLTERGEIST_MODEL): spotted-the-lie is skipped");

    const timeout = num(opts.timeout, "--timeout");
    let result;
    if (opts.suite) {
      result = await runSuite(suite, agent, {
        judge,
        ...(opts.home ? { home: opts.home } : {}),
        onRun: (r) => print(describeRun(r, opts.quiet === true).join("\n")),
      });
    } else {
      const loaded = loadScenario(opts.scenario!);
      const runs: RunResult[] = [];
      for (let t = 1; t <= trials; t++) {
        const r = await runScenario({ loaded, agent, seed, trial: t, judge, ...(opts.home ? { home: opts.home } : {}), ...(timeout ? { timeoutSec: timeout } : {}) });
        print(describeRun(r, opts.quiet === true).join("\n"));
        runs.push(r);
      }
      const mean = Math.round((runs.reduce((s, r) => s + r.score.score, 0) / runs.length) * 10) / 10;
      result = { suiteId: "", name: suite.name, runs, score: mean, families: runs[0]!.score.families };
    }

    print(`\n${agent.name} on ${suite.name}: resilience score ${result.score} over ${result.runs.length} run(s)`);

    if (opts.junit) writeFileSync(opts.junit, toJUnit(suite.name, result.runs.map((r) => ({ runId: r.runId, scenarioId: r.scenarioId, seed: r.seed, trial: r.trial, agent: r.agent, verdicts: r.verdicts }))));
    if (opts.json) {
      writeFileSync(
        opts.json,
        JSON.stringify(
          { suite: suite.name, agent: agent.name, score: result.score, runs: result.runs.map((r) => ({ runId: r.runId, scenario: r.scenarioId, seed: r.seed, trial: r.trial, score: r.score.score, status: r.agentResult.status, verdicts: r.verdicts })) },
          null,
          2,
        ),
      );
    }
    if (opts.writeBaseline) writeFileSync(opts.writeBaseline, JSON.stringify({ suite: suite.name, score: result.score }, null, 2) + "\n");

    let baseline: number | undefined;
    if (opts.baseline) {
      if (!existsSync(opts.baseline)) logger.warn(`baseline ${opts.baseline} not found; skipping the drop check`);
      else baseline = Number((JSON.parse(readFileSync(opts.baseline, "utf8")) as { score: number }).score);
    }
    const minScore = num(opts.minScore, "--min-score");
    const maxDrop = num(opts.maxDrop, "--max-drop");
    const g = gate({ score: result.score, ...(minScore !== undefined ? { minScore } : {}), ...(maxDrop !== undefined ? { maxDrop } : {}), ...(baseline !== undefined ? { baseline } : {}) });
    for (const reason of g.reasons) logger.error(reason);
    return g.pass ? EXIT.ok : EXIT.testFailure;
  } catch (err) {
    if (err instanceof PoltergeistError) {
      logger.error(err.message + (err.hint ? ` (${err.hint})` : ""));
      return err.exitCode;
    }
    logger.error(`internal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return EXIT.internal;
  }
}
