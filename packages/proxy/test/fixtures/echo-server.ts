/**
 * A tiny MCP server for tests. It logs to stderr on purpose, to prove stderr never reaches the
 * protocol channel. Tools: echo(text), add(a, b), crash(code) exits the process.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "echo-fixture", version: "0.0.0" });

server.registerTool("echo", { description: "Echo text back", inputSchema: { text: z.string() } }, async ({ text }) => {
  process.stderr.write(`echo-fixture: echo ${text.length} chars\n`);
  return { content: [{ type: "text", text }] };
});

server.registerTool("add", { description: "Add two numbers", inputSchema: { a: z.number(), b: z.number() } }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
  structuredContent: { sum: a + b },
}));

server.registerTool("crash", { description: "Exit with a code", inputSchema: { code: z.number().int() } }, async ({ code }) => {
  setTimeout(() => process.exit(code), 10);
  return { content: [{ type: "text", text: `exiting with ${code}` }] };
});

process.stderr.write("echo-fixture: starting\n");
await server.connect(new StdioServerTransport());
