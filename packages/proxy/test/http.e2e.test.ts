import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { startHttpProxy, type HttpProxyHandle } from "../src/http.js";

let upstream: Server;
let upstreamUrl: string;
let proxy: HttpProxyHandle;
const upstreamSessions = new Set<string>();

beforeAll(async () => {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const sid = req.headers["mcp-session-id"];
    let t = typeof sid === "string" ? transports.get(sid) : undefined;
    if (!t) {
      t = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, t!);
          upstreamSessions.add(id);
        },
      });
      const server = new McpServer({ name: "http-fixture", version: "0" });
      server.registerTool("add", { inputSchema: { a: z.number(), b: z.number() } }, async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      }));
      await server.connect(t);
    }
    await t.handleRequest(req, res, body);
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/mcp`;
  proxy = await startHttpProxy({ upstreamUrl, port: 0, recordDir: null });
});

afterAll(async () => {
  await proxy.close();
  await new Promise<void>((r) => upstream.close(() => r()));
});

describe("Streamable HTTP proxy", () => {
  it("binds to 127.0.0.1 by default", () => {
    expect(proxy.url.startsWith("http://127.0.0.1:")).toBe(true);
  });

  it("proxies calls and maps each agent session to its own upstream session", async () => {
    const clients = await Promise.all(
      [1, 2].map(async () => {
        const c = new Client({ name: "http-e2e", version: "0" });
        await c.connect(new StreamableHTTPClientTransport(new URL(proxy.url)));
        return c;
      }),
    );
    const results = await Promise.all(clients.map((c, i) => c.callTool({ name: "add", arguments: { a: i, b: 10 } })));
    expect(results.map((r) => (r.content as Array<{ text: string }>)[0]!.text)).toEqual(["10", "11"]);
    expect(proxy.sessions()).toBe(2);
    expect(upstreamSessions.size).toBe(2);
    await Promise.all(clients.map((c) => c.close()));
  }, 30_000);
});
