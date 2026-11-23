import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { PoltergeistError, ScenarioSchema, scenarioProblems, type Scenario } from "@poltergeist/core";

export interface LoadedScenario {
  scenario: Scenario;
  path: string;
  /** Absolute path of the scenario's world directory, if it has one. */
  worldDir: string | null;
}

function readYaml(path: string, what: string): unknown {
  try {
    return parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new PoltergeistError("invalid_input", `cannot read ${what} ${path}: ${String(err)}`);
  }
}

function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  const where = issue && issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `field "${where}": ${issue?.message ?? "invalid"}`;
}

/** Load a scenario by path, or by id from `scenariosDir`. */
export function loadScenario(ref: string, scenariosDir = "scenarios"): LoadedScenario {
  const path = existsSync(ref) ? resolve(ref) : resolve(scenariosDir, `${ref}.yaml`);
  if (!existsSync(path)) throw new PoltergeistError("invalid_input", `no scenario "${ref}" (looked for ${path})`);
  const parsed = ScenarioSchema.safeParse(readYaml(path, "scenario"));
  if (!parsed.success) throw new PoltergeistError("invalid_input", `invalid scenario ${path}: ${firstIssue(parsed.error)}`);
  const scenario = parsed.data;
  let worldDir: string | null = null;
  if (scenario.world !== undefined) {
    worldDir = isAbsolute(scenario.world) ? scenario.world : join(dirname(path), scenario.world);
    if (!existsSync(worldDir)) throw new PoltergeistError("invalid_input", `scenario ${scenario.id}: world directory ${worldDir} does not exist`);
  }
  const problems = scenarioProblems(scenario);
  if (problems.length > 0) throw new PoltergeistError("invalid_input", `invalid scenario ${path}: ${problems[0]}`);
  return { scenario, path, worldDir };
}

export const SuiteSchema = z.object({
  name: z.string(),
  agent: z.string().optional(),
  runs: z
    .array(
      z.object({
        scenario: z.string(),
        seeds: z.array(z.number().int().min(0).max(0xffffffff)).min(1).default([1]),
        trials: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1),
});
export type Suite = z.infer<typeof SuiteSchema>;

export function loadSuite(ref: string, scenariosDir = "scenarios"): Suite {
  const path = existsSync(ref) ? ref : join(scenariosDir, "suites", `${ref}.yaml`);
  if (!existsSync(path)) throw new PoltergeistError("invalid_input", `no suite "${ref}" (looked for ${path})`);
  const parsed = SuiteSchema.safeParse(readYaml(path, "suite"));
  if (!parsed.success) throw new PoltergeistError("invalid_input", `invalid suite ${path}: ${firstIssue(parsed.error)}`);
  return parsed.data;
}
