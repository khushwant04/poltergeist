import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createLogger, type Interceptor, type Logger } from "@poltergeist/core";
import { ulid } from "ulid";
import { Proxy } from "./proxy.js";
import { FileTraceSink, NullTraceSink, type RedactionOptions } from "./recorder.js";

export interface HttpProxyOptions {
  upstreamUrl: string;
  port: number;
  host?: string;
  path?: string;
  /** Build a fresh interceptor list for each agent session (receives the session's proxy for recording). */
  interceptors?: (record: (name: "haunting_applied" | "plan_summary", detail: Record<string, unknown>) => void) => readonly Interceptor[];
  /** Called when a session ends, before its trace is closed. */
  onSessionEnd?: (record: (name: "haunting_applied" | "plan_summary", detail: Record<string, unknown>) => void) => void;
  requires?: readonly string[];
  recordDir?: string | null;
  redaction?: RedactionOptions;
  logger?: Logger;
  seed?: number | null;
  planHash?: string | null;
  scenarioId?: string | null;
}

export interface HttpProxyHandle {
  url: string;
  sessions(): number;
  close(): Promise<void>;
}

interface Session {
  agent: StreamableHTTPServerTransport;
  proxy: Proxy;
}

/**
 * Streamable HTTP proxy: each agent session gets its own upstream session and its own trace.
 * Binds to 127.0.0.1 unless a host is given.
 */
export async function startHttpProxy(opts: HttpProxyOptions): Promise<HttpProxyHandle> {
  const logger = opts.logger ?? createLogger("warn");
  const host = opts.host ?? "127.0.0.1";
  const path = opts.path ?? "/mcp";
  const recordDir = opts.recordDir === undefined ? ".poltergeist/runs" : opts.recordDir;
  const sessions = new Map<string, Session>();

  const newSession = async (): Promise<StreamableHTTPServerTransport> => {
    const runId = ulid();
    const sink =
      recordDir === null ? new NullTraceSink() : new FileTraceSink(join(recordDir, `${runId}.jsonl`), opts.redaction ?? {});
    const agent = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { agent, proxy });
      },
    });
    const upstream = new StreamableHTTPClientTransport(new URL(opts.upstreamUrl));
    let proxyRef: Proxy | undefined;
    const record = (name: "haunting_applied" | "plan_summary", detail: Record<string, unknown>) => proxyRef?.event(name, detail);
    const proxy = new Proxy({
      agent,
      upstream,
      sink,
      logger,
      runId,
      ...(opts.interceptors ? { interceptors: opts.interceptors(record) } : {}),
      ...(opts.requires ? { requires: opts.requires } : {}),
      seed: opts.seed ?? null,
      planHash: opts.planHash ?? null,
      scenarioId: opts.scenarioId ?? null,
    });
    proxyRef = proxy;
    void proxy.closed.then(() => {
      if (agent.sessionId) sessions.delete(agent.sessionId);
      opts.onSessionEnd?.(record);
      proxy.closeTrace();
    });
    await proxy.start();
    return agent;
  };

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      logger.error("http proxy request failed", String(err));
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "proxy error" }, id: null }));
      }
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== path) {
      res.writeHead(404).end();
      return;
    }
    const body = req.method === "POST" ? await readJson(req) : undefined;
    const sessionId = req.headers["mcp-session-id"];
    const existing = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.agent.handleRequest(req, res, body);
      return;
    }
    if (req.method === "POST" && sessionId === undefined && isInitialize(body)) {
      const agent = await newSession();
      await agent.handleRequest(req, res, body);
      return;
    }
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "unknown or missing session" }, id: null }));
  }

  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://${host}:${address.port}${path}`,
    sessions: () => sessions.size,
    close: async () => {
      await Promise.allSettled([...sessions.values()].map((s) => s.proxy.close()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? undefined : JSON.parse(text);
}

function isInitialize(body: unknown): boolean {
  const items = Array.isArray(body) ? body : [body];
  return items.some((m) => m !== null && typeof m === "object" && (m as { method?: unknown }).method === "initialize");
}
