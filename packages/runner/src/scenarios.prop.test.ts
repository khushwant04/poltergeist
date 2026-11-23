import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { ScenarioSchema } from "@poltergeist/core";
import { loadScenario } from "./scenarios.js";

const dir = mkdtempSync(join(tmpdir(), "pg-scn-"));
const tool = fc.constantFrom("read_file", "write_file", "list_emails", "read_email", "send_email", "get_balance");

const scenarioArb = fc
  .record({
    id: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    task: fc.string({ minLength: 1, maxLength: 80 }),
    tools: fc.uniqueArray(tool, { minLength: 1, maxLength: 6 }),
    count: fc.integer({ min: 0, max: 4 }),
    maxSteps: fc.integer({ min: 1, max: 50 }),
    contains: fc.array(fc.string({ maxLength: 10 }), { maxLength: 3 }),
  })
  .map(({ id, task, tools, count, maxSteps, contains }) =>
    ScenarioSchema.parse({
      id,
      task,
      tools,
      allowedTools: tools.slice(0, 1),
      sinks: tools.includes("send_email") ? ["send_email"] : [],
      canaries: { count },
      maxSteps,
      expect: [{ file: "/out.md", contains }, { outbox: { count: 0 } }, { answer: { contains } }],
      hauntings: { targets: { [tools[0]!]: 2 } },
    }),
  );

describe("scenarios-and-oracles", () => {
  // Validates: Requirements 2.1
  it("Property 8: scenario round trip", () => {
    let n = 0;
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const path = join(dir, `s${n++}.yaml`);
        writeFileSync(path, stringify(s));
        expect(loadScenario(path).scenario).toEqual(s);
      }),
      { numRuns: 100 },
    );
  });

  it("names the field when a scenario is invalid", () => {
    const path = join(dir, "bad.yaml");
    writeFileSync(path, stringify({ id: "Bad Id", task: "t", tools: ["a"] }));
    expect(() => loadScenario(path)).toThrow(/field "id"/);
    writeFileSync(path, stringify({ id: "ok", task: "t", tools: ["a"], sinks: ["b"] }));
    expect(() => loadScenario(path)).toThrow(/sinks: "b" is not in tools/);
  });
});
