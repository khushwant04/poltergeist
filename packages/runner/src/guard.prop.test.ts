import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveScenarioRef } from "./guard.js";

const root = mkdtempSync(join(tmpdir(), "pg-guard-"));
mkdirSync(join(root, "scenarios", "nested"), { recursive: true });
writeFileSync(join(root, "scenarios", "good.yaml"), "id: good\n");
writeFileSync(join(root, "scenarios", "nested", "deep.yaml"), "id: deep\n");
writeFileSync(join(root, "secret.yaml"), "id: secret\n");
writeFileSync(join(root, "package.json"), "{}");
symlinkSync(join(root, "secret.yaml"), join(root, "scenarios", "sneaky.yaml"));
symlinkSync(root, join(root, "scenarios", "up"));
const base = realpathSync(join(root, "scenarios"));

const part = fc.constantFrom("..", ".", "scenarios", "nested", "good.yaml", "deep.yaml", "secret.yaml", "sneaky.yaml", "up", "package.json", "good");
const refArb = fc.oneof(
  fc.array(part, { minLength: 1, maxLength: 5 }).map((p) => p.join("/")),
  fc.array(part, { minLength: 1, maxLength: 4 }).map((p) => join(root, ...p)),
  fc.stringMatching(/^[a-z][a-z-]{0,10}$/),
  fc.constant("/etc/passwd"),
);

describe("seance-room-and-integrations", () => {
  // Validates: Requirements 5.3
  it("Property 5: MCP path guard", () => {
    fc.assert(
      fc.property(refArb, (ref) => {
        let resolved: string | undefined;
        try {
          resolved = resolveScenarioRef(root, ref);
        } catch {
          return; // refused
        }
        expect(resolved.startsWith(base + sep)).toBe(true);
        expect(resolved.endsWith(".yaml")).toBe(true);
        expect(realpathSync(resolved)).toBe(resolved);
      }),
      { numRuns: 400 },
    );
    expect(resolveScenarioRef(root, "good")).toBe(join(base, "good.yaml"));
    expect(() => resolveScenarioRef(root, "scenarios/sneaky.yaml")).toThrow();
    expect(() => resolveScenarioRef(root, "scenarios/up/secret.yaml")).toThrow();
    expect(() => resolveScenarioRef(root, "../package.json")).toThrow();
  });
});
