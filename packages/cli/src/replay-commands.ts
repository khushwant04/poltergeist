import { resolve } from "node:path";
import { EXIT, PoltergeistError, createLogger } from "@poltergeist/core";
import type { OracleId } from "@poltergeist/oracles";
import { judgeFromEnv, replayRun, runRegressions, shrinkRun } from "@poltergeist/runner";
import { print, verdictLines } from "./output.js";

const ORACLES: OracleId[] = ["canary-leak", "forbidden-call", "injection-obedience", "task-completed", "recovered", "spotted-the-lie"];

const fail = (logger: ReturnType<typeof createLogger>, err: unknown): number => {
  if (err instanceof PoltergeistError) {
    logger.error(err.message + (err.hint ? ` (${err.hint})` : ""));
    return err.exitCode;
  }
  logger.error(`internal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  return EXIT.internal;
};

/** `poltergeist replay <runId> [--mode env|full]` */
export async function runReplay(runId: string, opts: { mode: string; home?: string; force?: boolean }): Promise<number> {
  const logger = createLogger("info");
  try {
    if (opts.mode !== "env" && opts.mode !== "full") throw new PoltergeistError("invalid_input", `--mode must be env or full, got "${opts.mode}"`);
    const r = await replayRun(runId, { mode: opts.mode, ...(opts.home ? { home: opts.home } : {}), ...(opts.force ? { force: true } : {}) });
    print(`${opts.mode} replay of ${runId} → run ${r.run.runId}  score ${r.run.score.score}`);
    if (r.mode === "full") {
      if (r.equivalent) print("   identical: every frame matches the recording");
      else print(`   DIVERGED at ${r.divergence!.kind} step ${r.divergence!.step}: ${r.divergence!.message}`);
    }
    print("   original:");
    print(verdictLines(r.originalVerdicts.filter((v) => v.applicable)).join("\n"));
    print("   replay:");
    print(verdictLines(r.run.verdicts.filter((v) => v.applicable)).join("\n"));
    return r.mode === "full" && !r.equivalent ? EXIT.testFailure : EXIT.ok;
  } catch (err) {
    return fail(logger, err);
  }
}

/** `poltergeist shrink <runId> --target <oracle>` */
export async function runShrink(
  runId: string,
  opts: { target: string; trials: string; budget: string; home?: string; force?: boolean; save: boolean; regressions: string },
): Promise<number> {
  const logger = createLogger("info");
  try {
    if (!ORACLES.includes(opts.target as OracleId)) throw new PoltergeistError("invalid_input", `--target must be one of ${ORACLES.join(", ")}`);
    let last = "";
    const r = await shrinkRun(runId, {
      target: opts.target as OracleId,
      trials: Number(opts.trials),
      budget: Number(opts.budget),
      judge: judgeFromEnv(),
      regressionsDir: opts.save ? resolve(opts.regressions) : null,
      ...(opts.home ? { home: opts.home } : {}),
      ...(opts.force ? { force: true } : {}),
      onProgress: (e) => {
        if (e.kind !== "candidate") return;
        const line = `   ${e.phase.padEnd(8)} ${String(e.entries).padStart(2)} hauntings → ${e.accepted ? "still fails" : "passes"}`;
        if (line !== last) logger.info(line);
        last = line;
      },
    });
    if (r.status === "flaky") {
      print(`the failure did not reproduce in ${opts.trials} trials; it looks flaky`);
      return EXIT.ok;
    }
    print(`${r.status === "partial" ? "budget ran out; best so far" : "minimal plan"}: ${r.original.entries.length} → ${r.minimal.entries.length} haunting(s), ${r.trialsUsed} trials, fails ${Math.round(r.failureRate * 100)}% of ${r.confirmTrials} confirm runs`);
    for (const e of r.minimal.entries) print(`   ${e.haunting} on ${e.target.toolName ?? e.target.method} #${e.target.occurrence}  ${JSON.stringify(e.params)}`);
    if (r.regressionPath) print(`saved regression case: ${r.regressionPath}`);
    return EXIT.ok;
  } catch (err) {
    return fail(logger, err);
  }
}

/** `poltergeist run --suite regressions` */
export async function runRegressionSuite(opts: { home?: string; regressions: string }): Promise<number> {
  const logger = createLogger("info");
  try {
    const outcomes = await runRegressions(resolve(opts.regressions), {
      judge: judgeFromEnv(),
      ...(opts.home ? { home: opts.home } : {}),
      onRun: (o) => print(`${o.fixed ? " fixed" : " STILL FAILS"}  ${o.target.padEnd(20)} ${o.path}  run ${o.run.runId}`),
    });
    if (outcomes.length === 0) print("no regression cases yet (create them with `poltergeist shrink`)");
    const open = outcomes.filter((o) => !o.fixed).length;
    print(`\n${outcomes.length - open} of ${outcomes.length} regression case(s) fixed`);
    return open === 0 ? EXIT.ok : EXIT.testFailure;
  } catch (err) {
    return fail(logger, err);
  }
}
