import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ROOT, TSX, wrapArgv } from "./helpers.js";

/** Run the real wrapper around the echo server, send raw JSON-RPC lines, return every stdout line. */
async function runRaw(texts: string[]): Promise<string[]> {
  const record = mkdtempSync(join(tmpdir(), "pg-purity-"));
  const child = spawn(TSX, wrapArgv(["--log-level", "debug", "--record", record]), { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c: string) => (out += c));
  child.stderr.resume();

  const send = (m: unknown) => child.stdin.write(JSON.stringify(m) + "\n");
  const responses = () => out.split("\n").filter((l) => l.trim() !== "").length;
  const waitFor = async (n: number) => {
    const until = Date.now() + 20_000;
    while (responses() < n) {
      if (Date.now() > until) throw new Error(`timed out waiting for ${n} lines, got: ${out}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  await waitFor(1);
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  texts.forEach((text, i) => send({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: "echo", arguments: { text } } }));
  await waitFor(1 + texts.length);
  child.stdin.end();
  await new Promise((r) => child.once("exit", r));
  return out.split("\n").filter((l) => l.trim() !== "");
}

describe("proxy-core", () => {
  // Validates: Requirements 1.3
  it("Property 8: stdout purity", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.string({ maxLength: 200 }), { minLength: 1, maxLength: 5 }), async (texts) => {
        const lines = await runRaw(texts);
        expect(lines.length).toBe(1 + texts.length);
        for (const line of lines) {
          const parsed = JSON.parse(line) as { jsonrpc?: string };
          expect(parsed.jsonrpc).toBe("2.0");
        }
      }),
      { numRuns: 3 },
    );
  }, 120_000);
});
