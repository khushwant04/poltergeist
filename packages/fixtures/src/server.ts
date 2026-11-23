import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OutsideWorldError, World, type Account, type CalendarEvent, type Email } from "./world.js";

export type Module = "files" | "mail" | "calendar" | "bank";
export const ALL_MODULES: readonly Module[] = ["files", "mail", "calendar", "bank"];

/** Every tool the fixture server can expose, and which are sinks (would send data out). */
export const TOOLS: Record<Module, readonly string[]> = {
  files: ["read_file", "list_dir", "write_file"],
  mail: ["list_emails", "read_email", "send_email"],
  calendar: ["list_events", "create_event"],
  bank: ["get_balance", "list_transactions", "transfer_funds"],
};
export const SINK_TOOLS = ["send_email", "transfer_funds"] as const;

function ok(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wrap a handler so thrown errors become tool errors instead of protocol errors. */
const safe =
  <A>(fn: (args: A) => CallToolResult) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return fn(args);
    } catch (err) {
      if (err instanceof OutsideWorldError) return fail(err.message);
      return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

export function createFixtureServer(world: World, modules: readonly Module[] = ALL_MODULES): McpServer {
  const server = new McpServer({ name: "poltergeist-haunted-house", version: "0.1.0" });

  if (modules.includes("files")) {
    server.registerTool(
      "read_file",
      { description: "Read a text file from the user's workspace.", inputSchema: { path: z.string().describe("Absolute path, e.g. /notes/todo.md") } },
      safe(({ path }) => {
        const abs = world.resolveFile(path);
        if (!existsSync(abs) || !statSync(abs).isFile()) return fail(`No such file: ${path}`);
        return ok({ path, content: readFileSync(abs, "utf8") });
      }),
    );
    server.registerTool(
      "list_dir",
      { description: "List files and folders in a workspace directory.", inputSchema: { path: z.string().default("/") } },
      safe(({ path }) => {
        const abs = world.resolveFile(path);
        if (!existsSync(abs) || !statSync(abs).isDirectory()) return fail(`No such directory: ${path}`);
        const entries = readdirSync(abs)
          .sort()
          .map((name) => ({ name, type: statSync(`${abs}/${name}`).isDirectory() ? "dir" : "file" }));
        return ok({ path, entries });
      }),
    );
    server.registerTool(
      "write_file",
      { description: "Create or overwrite a text file in the user's workspace.", inputSchema: { path: z.string(), content: z.string() } },
      safe(({ path, content }) => {
        const abs = world.resolveFile(path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
        return ok({ path, bytes: Buffer.byteLength(content) });
      }),
    );
  }

  if (modules.includes("mail")) {
    const inbox = () => world.readJson<Email[]>("mail/inbox.json", []);
    server.registerTool(
      "list_emails",
      { description: "List emails in the user's inbox (newest first).", inputSchema: { unreadOnly: z.boolean().default(false) } },
      safe(({ unreadOnly }) => {
        const emails = inbox()
          .filter((e) => !unreadOnly || e.unread)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map(({ id, from, subject, date, unread }) => ({ id, from, subject, date, unread }));
        return ok({ emails });
      }),
    );
    server.registerTool(
      "read_email",
      { description: "Read one email by id and mark it as read.", inputSchema: { id: z.string() } },
      safe(({ id }) => {
        const all = inbox();
        const email = all.find((e) => e.id === id);
        if (!email) return fail(`No email with id ${id}`);
        email.unread = false;
        world.writeJson("mail/inbox.json", all);
        return ok({ ...email });
      }),
    );
    server.registerTool(
      "send_email",
      { description: "Send an email on the user's behalf.", inputSchema: { to: z.string(), subject: z.string(), body: z.string() } },
      safe((args) => {
        const entry = world.appendOutbox("send_email", args);
        return ok({ status: "sent", id: `msg-${entry.n}` });
      }),
    );
  }

  if (modules.includes("calendar")) {
    const events = () => world.readJson<CalendarEvent[]>("calendar/events.json", []);
    server.registerTool(
      "list_events",
      {
        description: "List calendar events between two dates (inclusive, YYYY-MM-DD).",
        inputSchema: { from: z.string().optional(), to: z.string().optional() },
      },
      safe(({ from, to }) => {
        const list = events()
          .filter((e) => (from === undefined || e.date >= from) && (to === undefined || e.date <= to))
          .sort((a, b) => (a.date + (a.time ?? "") < b.date + (b.time ?? "") ? -1 : 1));
        return ok({ events: list });
      }),
    );
    server.registerTool(
      "create_event",
      {
        description: "Add an event to the user's calendar.",
        inputSchema: { title: z.string(), date: z.string(), time: z.string().optional(), durationMin: z.number().int().optional() },
      },
      safe((args) => {
        const all = events();
        const event: CalendarEvent = { id: `evt-${all.length + 1}`, ...args };
        all.push(event);
        world.writeJson("calendar/events.json", all);
        return ok({ event });
      }),
    );
  }

  if (modules.includes("bank")) {
    const accounts = () => world.readJson<Account[]>("bank/accounts.json", []);
    const find = (id?: string) => {
      const all = accounts();
      return id === undefined ? all[0] : all.find((a) => a.id === id);
    };
    server.registerTool(
      "get_balance",
      { description: "Get the current balance of a bank account.", inputSchema: { account: z.string().optional() } },
      safe(({ account }) => {
        const a = find(account);
        if (!a) return fail(`No account ${account ?? ""}`.trim());
        return ok({ account: a.id, name: a.name, balance: a.balance, currency: a.currency });
      }),
    );
    server.registerTool(
      "list_transactions",
      { description: "List recent transactions for an account.", inputSchema: { account: z.string().optional(), limit: z.number().int().default(10) } },
      safe(({ account, limit }) => {
        const a = find(account);
        if (!a) return fail(`No account ${account ?? ""}`.trim());
        return ok({ account: a.id, transactions: a.transactions.slice(0, limit) });
      }),
    );
    server.registerTool(
      "transfer_funds",
      {
        description: "Transfer money from the user's account to another account.",
        inputSchema: { toAccount: z.string(), amount: z.number().positive(), memo: z.string().default("") },
      },
      safe((args) => {
        const entry = world.appendOutbox("transfer_funds", args);
        return ok({ status: "completed", reference: `TX-${String(entry.n).padStart(4, "0")}` });
      }),
    );
  }

  return server;
}
