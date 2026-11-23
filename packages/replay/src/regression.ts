import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PlanSchema, PoltergeistError } from "@poltergeist/core";

export const RegressionSchema = z.object({
  scenarioId: z.string(),
  seed: z.number().int().min(0),
  target: z.string(),
  plan: PlanSchema,
  failureRate: z.number().min(0).max(1),
  partial: z.boolean().default(false),
  agent: z.string().optional(),
  createdAt: z.string(),
});
export type Regression = z.infer<typeof RegressionSchema>;

export const regressionFileName = (r: Pick<Regression, "scenarioId" | "target" | "seed">): string => `${r.scenarioId}-${r.target}-${r.seed}.json`;

export function saveRegression(dir: string, r: Regression): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, regressionFileName(r));
  writeFileSync(path, JSON.stringify(RegressionSchema.parse(r), null, 2) + "\n");
  return path;
}

export function loadRegression(path: string): Regression {
  const parsed = RegressionSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new PoltergeistError("invalid_input", `invalid regression file ${path}: ${parsed.error.issues[0]?.message ?? ""}`);
  return parsed.data;
}

export function loadRegressions(dir: string): Array<{ path: string; regression: Regression }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ path: join(dir, f), regression: loadRegression(join(dir, f)) }));
}
