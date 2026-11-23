import { readFileSync } from "node:fs";
import { PlanSchema, PoltergeistError, hashOf, type Plan } from "@poltergeist/core";

/** Load and validate a plan file. Throws `invalid_input` naming the bad field. */
export function loadPlanFile(path: string): { plan: Plan; planHash: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new PoltergeistError("invalid_input", `cannot read plan file ${path}: ${String(err)}`);
  }
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join(".") : "(root)";
    throw new PoltergeistError(
      "invalid_input",
      `invalid plan file ${path}: field "${where}": ${issue?.message ?? "invalid"}`,
      "Plans are JSON with version, catalogVersion, seed, scenarioId, entries and requires.",
    );
  }
  return { plan: parsed.data, planHash: hashOf(parsed.data) };
}
