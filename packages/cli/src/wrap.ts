import { EXIT, PoltergeistError, createLogger, type LogLevel } from "@poltergeist/core";
import { loadPlanFile, startHttpProxy, startStdioProxy } from "@poltergeist/proxy";

export interface WrapOptions {
  plan?: string;
  seed?: string;
  scenario?: string;
  record: string | false;
  redact: string[];
  upstream?: string;
  listen?: string;
  host?: string;
  logLevel: LogLevel;
}

/** Returns the process exit code. */
export async function runWrap(command: string[], opts: WrapOptions): Promise<number> {
  const logger = createLogger(opts.logLevel);
  try {
    if (opts.seed !== undefined || opts.scenario !== undefined) {
      if (opts.seed === undefined || opts.scenario === undefined) {
        throw new PoltergeistError("invalid_input", "--seed and --scenario must be given together");
      }
      if (!/^\d+$/.test(opts.seed) || Number(opts.seed) > 0xffffffff) {
        throw new PoltergeistError("invalid_input", `--seed must be an integer from 0 to 4294967295, got "${opts.seed}"`);
      }
      throw new PoltergeistError(
        "not_available",
        "generating a plan from --seed and --scenario needs the haunting engine, which is not available yet",
        "Pass a plan file with --plan instead.",
      );
    }

    const loaded = opts.plan !== undefined ? loadPlanFile(opts.plan) : undefined;
    const redaction = { patterns: opts.redact.map((p) => toRegExp(p)) };
    const common = {
      logger,
      redaction,
      recordDir: opts.record === false ? null : opts.record,
      requires: loaded?.plan.requires ?? [],
      seed: loaded?.plan.seed ?? null,
      planHash: loaded?.planHash ?? null,
      scenarioId: loaded?.plan.scenarioId ?? null,
    };
    if (loaded && loaded.plan.entries.length > 0) {
      logger.warn(
        `plan has ${loaded.plan.entries.length} entries but no haunting engine is installed yet; traffic is recorded but not haunted`,
      );
    }

    if (opts.upstream !== undefined) {
      if (command.length > 0) throw new PoltergeistError("invalid_input", "use either --upstream or a command after --, not both");
      const port = opts.listen === undefined ? 0 : Number(opts.listen);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new PoltergeistError("invalid_input", `--listen must be a port number, got "${opts.listen}"`);
      }
      const handle = await startHttpProxy({
        ...common,
        upstreamUrl: opts.upstream,
        port,
        ...(opts.host !== undefined ? { host: opts.host } : {}),
      });
      logger.info(`proxying ${opts.upstream} at ${handle.url}`);
      await new Promise<void>((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
      await handle.close();
      return EXIT.ok;
    }

    const [cmd, ...args] = command;
    if (cmd === undefined) {
      throw new PoltergeistError("invalid_input", "no server command given", "Usage: poltergeist wrap [options] -- <command> [args...]");
    }
    let handle;
    try {
      handle = await startStdioProxy({ ...common, command: cmd, args });
    } catch (err) {
      if (err instanceof PoltergeistError) throw err;
      throw new PoltergeistError("spawn_failed", `could not start "${cmd}": ${String(err)}`);
    }
    if (handle.tracePath) logger.info(`recording to ${handle.tracePath}`);
    const onSignal = (signal: NodeJS.Signals) => {
      logger.info(`received ${signal}, shutting down`);
      void handle.stop();
    };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
    return await handle.done;
  } catch (err) {
    if (err instanceof PoltergeistError) {
      logger.error(err.message + (err.hint ? ` (${err.hint})` : ""));
      return err.exitCode;
    }
    logger.error(`internal error: ${String(err)}`);
    return EXIT.internal;
  }
}

function toRegExp(p: string): RegExp {
  try {
    return new RegExp(p, "g");
  } catch (err) {
    throw new PoltergeistError("invalid_input", `--redact pattern "${p}" is not a valid regular expression: ${String(err)}`);
  }
}
