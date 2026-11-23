import { mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createFixtureServer } from "./server.js";
import { OutsideWorldError, World } from "./world.js";

function makeWorld() {
  const parent = mkdtempSync(join(tmpdir(), "pg-world-"));
  const root = join(parent, "world");
  mkdirSync(join(root, "files", "notes"), { recursive: true });
  writeFileSync(join(parent, "secret.txt"), "outside the world");
  symlinkSync(join(parent, "secret.txt"), join(root, "files", "link-out"));
  symlinkSync(parent, join(root, "files", "dir-out"));
  return { parent, world: new World(root) };
}

const segment = fc.oneof(fc.constantFrom("..", ".", "notes", "link-out", "dir-out", "secret.txt", "a"), fc.stringMatching(/^[a-z]{1,6}$/));
const pathArb = fc.tuple(fc.boolean(), fc.array(segment, { maxLength: 6 })).map(([abs, parts]) => (abs ? "/" : "") + parts.join("/"));

describe("scenarios-and-oracles", () => {
  // Validates: Requirements 1.2, 1.3
  it("Property 9: the world stays inside its directory", async () => {
    const { parent, world } = makeWorld();
    const [c, s] = InMemoryTransport.createLinkedPair();
    const server = createFixtureServer(world);
    await server.connect(s);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(c);
    const before = readdirSync(parent).sort();

    await fc.assert(
      fc.asyncProperty(pathArb, async (path) => {
        let resolved: string | undefined;
        try {
          resolved = world.resolveFile(path);
        } catch (e) {
          expect(e).toBeInstanceOf(OutsideWorldError);
        }
        if (resolved !== undefined) expect(resolved.startsWith(world.filesRoot)).toBe(true);
        const read = await client.callTool({ name: "read_file", arguments: { path } });
        const text = JSON.stringify(read.content);
        expect(text).not.toContain("outside the world");
        await client.callTool({ name: "write_file", arguments: { path, content: "x" } });
      }),
      { numRuns: 150 },
    );
    // Nothing was created next to the world.
    expect(readdirSync(parent).sort()).toEqual(before);
    // Sinks only append to the outbox.
    await client.callTool({ name: "send_email", arguments: { to: "a@b.invalid", subject: "s", body: "b" } });
    expect(world.outbox()).toEqual([{ tool: "send_email", args: { to: "a@b.invalid", subject: "s", body: "b" }, n: 1 }]);
    await client.close();
  });
});
