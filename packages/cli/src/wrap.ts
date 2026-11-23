import { EXIT, PoltergeistError, createLogger, type Interceptor, type LogLevel, type Plan, type ScenarioContext } from "@poltergeist/core";
import { CATALOG, HauntingEngine, generatePlan, planHash } from "@poltergeist/hauntings";
import { loadPlanFile, startHttpProxy, startStdioProxy } from "@poltergeist/proxy";
import { loadScenario, parseSeed, scenarioContext } from "./scenario.js";

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

type Recorder = (name: "haunting_applied" | "plan_summary", detail: Record<string, unknown>) => void;

interface Haunting {
  plan: Plan;
  planHash: string;
  ctx: ScenarioContext;
}

/** Work out the plan from --plan / --seed / --scenario. Undefined means plain pass-through. */
export function resolveHaunting(opts: Pick<WrapOptions, "plan" | "seed" | "scenario">): Haunting | undefined {
  if (opts.plan !== undefined) {
    const { plan, planHash: hash } = loadPlanFile(opts.plan);
    if (opts.seed !== undefined) throw new PoltergeistError("invalid_input", "use either --plan or --seed, not both");
    if (plan.entries.length === 0) return opts.scenario ? { plan, planHash: hash, ctx: scenarioContext(loadScenario(opts.scenario), plan.seed) } : undefined;
    if (opts.scenario === undefined) {
      throw new PoltergeistError("invalid_input", "a plan with hauntings needs --scenario (for the task text, sinks and canaries)");
    }
    const scenario = loadScenario(opts.scenario);
    if (scenario.id !== plan.scenarioId) {
      throw new PoltergeistError("invalid_input", `the plan is for scenario "${plan.scenarioId}" but --scenario is "${scenario.id}"`);
    }
    return { plan, planHash: hash, ctx: scenarioContext(scenario, plan.seed) };
  }
  if (opts.seed === undefined && opts.scenario === undefined) return undefined;
  if (opts.seed === undefined || opts.scenario === undefined) {
    throw new PoltergeistError("invalid_input", "--seed and --scenario must be given together");
  }
  const seed = parseSeed(opts.seed);
  const ctx = scenarioContext(loadScenario(opts.scenario), seed);
  const plan = generatePlan(seed, ctx, CATALOG);
  return { plan, planHash: planHash(plan), ctx };
}

function engineFor(h: Haunting, record: Recorder): HauntingEngine {
  return new HauntingEngine(h.plan, h.ctx, CATALOG, (a) =>
    record("haunting_applied", { entryIndex: a.entryIndex, haunting: a.haunting, family: a.family, seq: a.seq, description: a.description, ...(a.record ? { record: a.record } : {}) }),
  );
}

/** Returns the process exit code. */
export async function runWrap(command: string[], opts: WrapOptions): Promise<number> {
  const logger = createLogger(opts.logLevel);
  try {
    const haunting = resolveHaunting(opts);
    const redaction = { patterns: opts.redact.map(toRegExp), keep: haunting?.ctx.canaries ?? [] };
    const common = {
      logger,
      redaction,
      recordDir: opts.record === false ? null : opts.record,
      requires: haunting?.plan.requires ?? [],
      seed: haunting?.plan.seed ?? null,
      planHash: haunting?.planHash ?? null,
      scenarioId: haunting?.plan.scenarioId ?? null,
    };
    if (haunting) {
      logger.info(`haunting plan ${haunting.planHash.slice(0, 12)} with ${haunting.plan.entries.length} entr${haunting.plan.entries.length === 1 ? "y" : "ies"}`);
      for (const e of haunting.plan.entries) {
        const h = CATALOG.byId.get(e.haunting);
        if (h) logger.info(`  ${h.describe(e.params, e.target)}`);
      }
    }

    if (opts.upstream !== undefined) {
      if (command.length > 0) throw new PoltergeistError("invalid_input", "use either --upstream or a command after --, not both");
      const port = opts.listen === undefined ? 0 : Number(opts.listen);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new PoltergeistError("invalid_input", `--listen must be a port number, got "${opts.listen}"`);
      }
      const engines = new WeakMap<Recorder, HauntingEngine>();
      const handle = await startHttpProxy({
        ...common,
        upstreamUrl: opts.upstream,
        port,
        ...(opts.host !== undefined ? { host: opts.host } : {}),
        ...(haunting
          ? {
              interceptors: (record: Recorder): Interceptor[] => {
                const engine = engineFor(haunting, record);
                engines.set(record, engine);
                return [engine];
              },
              onSessionEnd: (record: Recorder) => {
                const engine = engines.get(record);
                if (engine) record("plan_summary", { unfired: engine.unfired(), applied: engine.applied.length });
              },
            }
          : {}),
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
    let engine: HauntingEngine | undefined;
    let handle;
    try {
      handle = await startStdioProxy({
        ...common,
        command: cmd,
        args,
        ...(haunting
          ? {
              onProxy: (proxy) => {
                engine = engineFor(haunting, (name, detail) => proxy.event(name, detail));
              },
              interceptors: [
                {
                  name: "haunting-engine",
                  onFrame: (frame, ctx) => (engine ? engine.onFrame(frame) : { kind: "forward" as const }),
                },
              ],
              onFinish: (proxy) => {
                if (engine) proxy.event("plan_summary", { unfired: engine.unfired(), applied: engine.applied.length });
              },
            }
          : {}),
      });
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
