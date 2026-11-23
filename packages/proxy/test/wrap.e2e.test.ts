import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { parseTrace } from "@poltergeist/core";
import { BIN, ROOT, TSX, wrapArgv } from "./helpers.js";

function connect(record: string) {
  const transport = new StdioClientTransport({ command: TSX, args: wrapArgv(["--record", record]), cwd: ROOT, stderr: "pipe" });
  const client = new Client({ name: "e2e", version: "0" });
  return { client, transport };
}

const waitExit = async (pid: number) => {
  const until = Date.now() + 15_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (Date.now() > until) throw new Error(`process ${pid} still running`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe("poltergeist wrap (end to end)", () => {
  it("is transparent to a real MCP client and records the run", async () => {
    const record = mkdtempSync(join(tmpdir(), "pg-e2e-"));
    const { client, transport } = connect(record);
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(["echo", "add", "crash"]);
    const added = await client.callTool({ name: "add", arguments: { a: 2, b: 40 } });
    expect(added.structuredContent).toEqual({ sum: 42 });
    const pid = transport.pid!;
    await client.close();
    await waitExit(pid);

    const files = readdirSync(record);
    expect(files).toHaveLength(1);
    const lines = parseTrace(readFileSync(join(record, files[0]!), "utf8"));
    expect(lines[0]).toMatchObject({ type: "header" });
    const calls = lines.filter((l) => l.type === "frame" && l.method === "tools/call");
    expect(calls).toHaveLength(2); // request + response
    expect(calls.every((c) => c.type === "frame" && c.toolName === "add" && c.occurrence === 1)).toBe(true);
    expect(lines.at(-1)).toMatchObject({ type: "event", name: "child_exit" });
  }, 60_000);

  it("exits with the server's exit code when the server exits", async () => {
    const record = mkdtempSync(join(tmpdir(), "pg-e2e-"));
    const { client, transport } = connect(record);
    let wrapperExit: number | null | undefined;
    await client.connect(transport);
    const proc = (transport as unknown as { _process?: import("node:child_process").ChildProcess })._process;
    const exited = new Promise<void>((r) => proc!.once("exit", (code) => ((wrapperExit = code), r())));
    await client.callTool({ name: "crash", arguments: { code: 7 } });
    await exited;
    expect(wrapperExit).toBe(7);
  }, 60_000);

  it("exits with code 2 and a clear message on invalid input", () => {
    const r = spawnSync(TSX, [BIN, "wrap", "--seed", "abc", "--scenario", "x.yaml", "--", "true"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--seed must be an integer/);
    expect(r.stdout).toBe("");

    const noCmd = spawnSync(TSX, [BIN, "wrap"], { cwd: ROOT, encoding: "utf8" });
    expect(noCmd.status).toBe(2);
    expect(noCmd.stderr).toMatch(/no server command/);
  }, 60_000);
});
