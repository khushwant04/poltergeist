import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, FAST_CHECK_VERSION, POLTERGEIST_VERSION, deriveCanaries, parseTrace, type RunBundle } from "@poltergeist/core";
import { fakeAgent } from "./agents/fake.js";
import { buildBundle, exportBundles } from "./export.js";
import { gate } from "./gate.js";
import { runScenario } from "./run.js";
import { loadScenario } from "./scenarios.js";

const ROOT = join(import.meta.dirname, "../../..");
const SCENARIO = join(ROOT, "scenarios/inbox-summary.yaml");
const home = mkdtempSync(join(tmpdir(), "pg-export-"));

describe("seance-room-and-integrations", () => {
  // Validates: Requirements 1.1, 1.2
  it("Property 1: bundle round trip", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("inbox-summary", "pay-the-invoice", "plan-my-week"), fc.integer({ min: 1, max: 99 }), fc.boolean(), async (id, seed, gullible) => {
        const r = await runScenario({ loaded: loadScenario(join(ROOT, "scenarios", `${id}.yaml`)), agent: fakeAgent({ fallFor: gullible ? ["possession", "whisper"] : [] }), seed, home });
        const out = mkdtempSync(join(tmpdir(), "pg-out-"));
        const index = await exportBundles(out, [r.runId], { home, regressionsDir: null });
        const b = JSON.parse(readFileSync(join(out, "bundles", `${r.runId}.json`), "utf8")) as RunBundle;
        const frames = parseTrace(readFileSync(r.tracePath, "utf8")).filter((l) => l.type === "frame");
        expect(b.frames).toHaveLength(frames.length);
        expect(b.verdicts).toEqual(r.verdicts);
        expect(b.score.score).toBe(r.score.score);
        expect(index.runs[0]).toMatchObject({ runId: r.runId, score: r.score.score, scenarioId: id });
        expect(JSON.parse(readFileSync(join(out, "bundles", "catalog.json"), "utf8"))).toHaveLength(6);
      }),
      { numRuns: 6 },
    );
  }, 120_000);

  // Validates: Requirements 1.3
  it("Property 2: bundles contain no secrets", async () => {
    const canary = deriveCanaries(9, 1)[0]!;
    let n = 0;
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^sk-[a-z0-9]{12,24}$/), async (secret) => {
        const runId = `SECRET${n++}`;
        const dir = join(home, "runs");
        mkdirSync(dir, { recursive: true });
        const lines = [
          { type: "header", runId, versions: { poltergeist: POLTERGEIST_VERSION, catalog: CATALOG_VERSION, fastCheck: FAST_CHECK_VERSION }, seed: 9, planHash: null, scenarioId: "inbox-summary", startedAt: "2026-11-23T00:00:00.000Z" },
          { type: "event", t: 0, name: "run_context", detail: { scenarioPath: SCENARIO, canaries: [canary], agent: "fake", trial: 1 } },
          { type: "frame", seq: 1, dir: "c2s", t: 1, msg: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "write_file", arguments: { path: "/k", content: `key ${secret} and ${canary}` } } }, method: "tools/call", toolName: "write_file", occurrence: 1 },
          { type: "event", t: 2, name: "answer", detail: { text: `I used ${secret}` } },
        ];
        writeFileSync(join(dir, `${runId}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
        const b = JSON.stringify(await buildBundle(runId, { home, redact: [/sk-[a-z0-9]+/g] }));
        expect(b).not.toContain(secret);
        expect(b).toContain(canary);
      }),
      { numRuns: 50 },
    );
  });

  // Validates: Requirements 6.3
  it("Property 6: action gate", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        (score, minScore, maxDrop, baseline) => {
          const g = gate({ score, ...(minScore !== undefined ? { minScore } : {}), ...(maxDrop !== undefined ? { maxDrop } : {}), ...(baseline !== undefined ? { baseline } : {}) });
          const shouldFail = (minScore !== undefined && score < minScore) || (maxDrop !== undefined && baseline !== undefined && baseline - score > maxDrop);
          expect(g.pass).toBe(!shouldFail);
          expect(g.reasons.length > 0).toBe(shouldFail);
        },
      ),
      { numRuns: 300 },
    );
  });
});
