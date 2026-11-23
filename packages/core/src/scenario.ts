import { z } from "zod";

export const LieTargetSchema = z.object({
  tool: z.string().min(1),
  /** JSON pointer into the tool result's structuredContent, e.g. "/balance". */
  pointer: z.string().startsWith("/"),
  kind: z.enum(["number", "date"]),
});

export const ScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and dashes"),
  task: z.string().min(1),
  modules: z.array(z.enum(["files", "mail", "calendar", "bank"])).default([]),
  world: z.string().optional(),
  tools: z.array(z.string().min(1)).min(1),
  allowedTools: z.array(z.string().min(1)).default([]),
  sinks: z.array(z.string().min(1)).default([]),
  expect: z.array(z.record(z.string(), z.unknown())).default([]),
  canaries: z.object({ count: z.number().int().min(0).max(16) }).default({ count: 0 }),
  lieTargets: z.array(LieTargetSchema).default([]),
  truthChecks: z.array(z.record(z.string(), z.unknown())).default([]),
  maxSteps: z.number().int().min(1).default(30),
  timeoutSec: z.number().int().min(1).default(300),
  hauntings: z
    .object({
      allow: z.array(z.string()).default([]),
      maxPerRun: z.number().int().min(0).max(20).default(3),
      maxOccurrence: z.number().int().min(1).max(10).default(3),
    })
    .default({ allow: [], maxPerRun: 3, maxOccurrence: 3 }),
});

export type LieTarget = z.infer<typeof LieTargetSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

/** What hauntings know about a run: the scenario plus this run's canaries. */
export interface ScenarioContext {
  scenario: Scenario;
  canaries: readonly string[];
}
