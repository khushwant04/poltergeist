import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createPoltergeistMcp } from "../src/mcp-server.js";

const ROOT = join(import.meta.dirname, "../../..");

async function connect() {
  const home = mkdtempSync(join(tmpdir(), "pg-mcp-"));
  const server = createPoltergeistMcp({ root: ROOT, home });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "ide", version: "0" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0]!.text;
    return { isError: r.isError === true, text, json: () => JSON.parse(text) as Record<string, unknown> };
  };
  return { client, call };
}

describe("poltergeist mcp (end to end)", () => {
  it("an IDE agent can list hauntings, run one, poll the report and replay it", async () => {
    const { client, call } = await connect();
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["haunt_catalog", "haunt_replay", "haunt_report", "haunt_run", "haunt_shrink"]);
    expect(JSON.parse((await call("haunt_catalog")).text)).toHaveLength(6);

    const started = (await call("haunt_run", { scenario: "pay-the-invoice", seed: 1, agent: "fake", fallFor: ["possession"] })).json() as { runIds: string[] };
    expect(started.runIds).toHaveLength(1);
    const id = started.runIds[0]!;
    let report: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      report = (await call("haunt_report", { id })).json();
      if (report["status"] !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(report).toMatchObject({ status: "done", scenario: "pay-the-invoice", capped: true });
    expect((report["failing"] as Array<{ oracle: string }>).map((f) => f.oracle)).toContain("canary-leak");

    const replay = (await call("haunt_replay", { runId: id, mode: "full" })).json();
    expect(replay["equivalent"]).toBe(true);
    await client.close();
  }, 60_000);

  it("refuses scenarios outside the repository's scenarios folder", async () => {
    const { call } = await connect();
    for (const scenario of ["../package.json", "/etc/passwd", "scenarios/../package.json", "nope"]) {
      const r = await call("haunt_run", { scenario });
      expect(r.isError).toBe(true);
    }
  });
});
