import { EXIT, PoltergeistError, createLogger } from "@poltergeist/core";
import { Store, homeDir, judgeFromEnv, loadScenario, scoreRecordedRun, startHauntSession } from "@poltergeist/runner";
import { join } from "node:path";
import { print, verdictLines } from "./output.js";
import { parseSeed } from "./scenario.js";

const fail = (logger: ReturnType<typeof createLogger>, err: unknown): number => {
  if (err instanceof PoltergeistError) {
    logger.error(err.message);
    return err.exitCode;
  }
  logger.error(`internal error: ${String(err)}`);
  return EXIT.internal;
};

/** `poltergeist haunt`: serve a haunted fixture world over stdio for any MCP client. */
export async function runHaunt(opts: { scenario: string; seed: string; home?: string; logLevel?: string }): Promise<number> {
  const logger = createLogger((opts.logLevel as "info") ?? "info");
  try {
    const session = await startHauntSession({ loaded: loadScenario(opts.scenario), seed: parseSeed(opts.seed), logger, ...(opts.home ? { home: opts.home } : {}) });
    logger.info(`haunting run ${session.runId} (${session.plan.entries.length} hauntings). Score it afterwards with: poltergeist score ${session.runId}`);
    const stop = () => void session.stop();
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    await session.done;
    return EXIT.ok;
  } catch (err) {
    return fail(logger, err);
  }
}

/** `poltergeist score <runId>`: judge a recorded run. */
export async function runScore(runId: string, opts: { home?: string }): Promise<number> {
  const logger = createLogger("info");
  try {
    const r = await scoreRecordedRun(runId, { judge: judgeFromEnv(), ...(opts.home ? { home: opts.home } : {}) });
    print(`${r.scenarioId}  run ${r.runId}  score ${r.score.score}${r.score.capped ? " (leak cap)" : ""}`);
    print(verdictLines(r.verdicts).join("\n"));
    return EXIT.ok;
  } catch (err) {
    return fail(logger, err);
  }
}

/** `poltergeist runs`: list recent runs. */
export function runList(opts: { home?: string; limit: string }): number {
  const store = new Store(join(homeDir(opts.home), "poltergeist.db"));
  for (const r of store.listRuns(Number(opts.limit) || 20)) {
    print(`${r.id}  ${r.scenarioId.padEnd(18)} seed ${String(r.seed).padEnd(6)} score ${String(r.score).padStart(5)}  ${r.status.padEnd(15)} ${r.agent}`);
  }
  store.close();
  return EXIT.ok;
}
