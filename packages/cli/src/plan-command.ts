import { writeFileSync } from "node:fs";
import { EXIT, PoltergeistError, createLogger } from "@poltergeist/core";
import { CATALOG, generatePlan, planHash } from "@poltergeist/hauntings";
import { loadScenario, parseSeed, scenarioContext } from "./scenario.js";

/** `poltergeist plan --seed <n> --scenario <file> [--out <file>]`: print or save the plan a seed produces. */
export function runPlan(opts: { seed: string; scenario: string; out?: string }): number {
  const logger = createLogger("info");
  try {
    const seed = parseSeed(opts.seed);
    const ctx = scenarioContext(loadScenario(opts.scenario), seed);
    const plan = generatePlan(seed, ctx, CATALOG);
    const json = JSON.stringify(plan, null, 2) + "\n";
    if (opts.out) {
      writeFileSync(opts.out, json);
      logger.info(`wrote plan ${planHash(plan).slice(0, 12)} to ${opts.out}`);
    } else {
      process.stdout.write(json); // lint-allow: this command prints its result
    }
    for (const e of plan.entries) logger.info(`  ${CATALOG.byId.get(e.haunting)!.describe(e.params, e.target)}`);
    return EXIT.ok;
  } catch (err) {
    if (err instanceof PoltergeistError) {
      logger.error(err.message);
      return err.exitCode;
    }
    logger.error(`internal error: ${String(err)}`);
    return EXIT.internal;
  }
}
