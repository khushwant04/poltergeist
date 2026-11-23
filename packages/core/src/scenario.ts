import { z } from "zod";

export const LieTargetSchema = z.object({
  tool: z.string().min(1),
  /** JSON pointer into the tool result's structuredContent, e.g. "/balance". */
  pointer: z.string().startsWith("/"),
  kind: z.enum(["number", "date"]),
});

/** Expected end state. Each item is one predicate, checked against the final world (or the answer). */
export const ExpectSchema = z.union([
  z.strictObject({
    file: z.string().startsWith("/"),
    exists: z.boolean().default(true),
    contains: z.array(z.string()).default([]),
    notContains: z.array(z.string()).default([]),
  }),
  z.strictObject({
    outbox: z.strictObject({
      tool: z.string().optional(),
      count: z.number().int().min(0).optional(),
      contains: z.array(z.string()).default([]),
      noneTo: z.array(z.string()).default([]),
    }),
  }),
  z.strictObject({
    calendar: z.strictObject({ title: z.string(), date: z.string().optional() }),
  }),
  z.strictObject({
    answer: z.strictObject({ contains: z.array(z.string()).default([]), notContains: z.array(z.string()).default([]) }),
  }),
]);

export const TruthCheckSchema = z.strictObject({
  /** What the answer should get right, in plain words, for the judge. */
  question: z.string(),
});

export const FakeStepSchema = z.strictObject({ tool: z.string().min(1), args: z.record(z.string(), z.unknown()).default({}) });

export const ScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and dashes"),
  task: z.string().min(1),
  modules: z.array(z.enum(["files", "mail", "calendar", "bank"])).default([]),
  world: z.string().optional(),
  tools: z.array(z.string().min(1)).min(1),
  allowedTools: z.array(z.string().min(1)).default([]),
  sinks: z.array(z.string().min(1)).default([]),
  expect: z.array(ExpectSchema).default([]),
  canaries: z.object({ count: z.number().int().min(0).max(16) }).default({ count: 0 }),
  lieTargets: z.array(LieTargetSchema).default([]),
  truthChecks: z.array(TruthCheckSchema).default([]),
  /** Tool calls the deterministic fake agent makes, in order (used in CI, where there is no API key). */
  fakeScript: z.array(FakeStepSchema).default([]),
  maxSteps: z.number().int().min(1).default(30),
  timeoutSec: z.number().int().min(1).default(300),
  hauntings: z
    .object({
      allow: z.array(z.string()).default([]),
      maxPerRun: z.number().int().min(0).max(20).default(3),
      maxOccurrence: z.number().int().min(1).max(10).default(3),
      /**
       * Tools worth haunting, each with how many times the task is expected to call it (the highest
       * occurrence to target). Empty means every tool, up to maxOccurrence.
       */
      targets: z.record(z.string(), z.number().int().min(1).max(10)).default({}),
    })
    .default({ allow: [], maxPerRun: 3, maxOccurrence: 3, targets: {} }),
});

export type LieTarget = z.infer<typeof LieTargetSchema>;

/** Problems a schema cannot express: references to tools the scenario does not have. */
export function scenarioProblems(s: z.infer<typeof ScenarioSchema>): string[] {
  const tools = new Set(s.tools);
  const out: string[] = [];
  for (const t of s.allowedTools) if (!tools.has(t)) out.push(`allowedTools: "${t}" is not in tools`);
  for (const t of s.sinks) if (!tools.has(t)) out.push(`sinks: "${t}" is not in tools`);
  for (const t of Object.keys(s.hauntings.targets)) if (!tools.has(t)) out.push(`hauntings.targets: "${t}" is not in tools`);
  for (const l of s.lieTargets) if (!tools.has(l.tool)) out.push(`lieTargets: "${l.tool}" is not in tools`);
  return out;
}
export type Expectation = z.infer<typeof ExpectSchema>;
export type FakeStep = z.infer<typeof FakeStepSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

/** What hauntings know about a run: the scenario plus this run's canaries. */
export interface ScenarioContext {
  scenario: Scenario;
  canaries: readonly string[];
}
