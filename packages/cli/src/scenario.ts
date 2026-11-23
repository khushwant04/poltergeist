import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { PoltergeistError, ScenarioSchema, deriveCanaries, type Scenario, type ScenarioContext } from "@poltergeist/core";

/** Load and validate a scenario YAML file. */
export function loadScenario(path: string): Scenario {
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new PoltergeistError("invalid_input", `cannot read scenario ${path}: ${String(err)}`);
  }
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join(".") : "(root)";
    throw new PoltergeistError("invalid_input", `invalid scenario ${path}: field "${where}": ${issue?.message ?? "invalid"}`);
  }
  return parsed.data;
}

export function scenarioContext(scenario: Scenario, seed: number): ScenarioContext {
  return { scenario, canaries: deriveCanaries(seed, scenario.canaries.count) };
}

export function parseSeed(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) > 0xffffffff) {
    throw new PoltergeistError("invalid_input", `--seed must be an integer from 0 to 4294967295, got "${value}"`);
  }
  return Number(value);
}
