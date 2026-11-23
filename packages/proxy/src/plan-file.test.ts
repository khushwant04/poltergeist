import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PoltergeistError } from "@poltergeist/core";
import { loadPlanFile } from "./plan-file.js";

const dir = mkdtempSync(join(tmpdir(), "pg-plan-"));
const write = (name: string, body: unknown) => {
  const p = join(dir, name);
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
  return p;
};
const valid = { version: 1, catalogVersion: "0", seed: 42, scenarioId: "demo", entries: [], requires: [] };

describe("plan files", () => {
  it("loads a valid plan with a stable hash", () => {
    const a = loadPlanFile(write("a.json", valid));
    const b = loadPlanFile(write("b.json", { requires: [], entries: [], scenarioId: "demo", seed: 42, catalogVersion: "0", version: 1 }));
    expect(a.planHash).toBe(b.planHash);
  });

  it("names the invalid field", () => {
    const p = write("bad.json", { ...valid, seed: -1 });
    expect(() => loadPlanFile(p)).toThrow(/field "seed"/);
    try {
      loadPlanFile(p);
    } catch (e) {
      expect(e).toBeInstanceOf(PoltergeistError);
      expect((e as PoltergeistError).exitCode).toBe(2);
    }
  });

  it("rejects files that are not JSON", () => {
    expect(() => loadPlanFile(write("x.json", "{nope"))).toThrow(PoltergeistError);
  });
});
