import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger, type Interceptor, type Logger } from "@poltergeist/core";
import { ulid } from "ulid";
import { ChildProcessTransport } from "./child-transport.js";
import { Proxy } from "./proxy.js";
import { FileTraceSink, NullTraceSink, type RedactionOptions, type TraceSink } from "./recorder.js";

export interface StdioProxyOptions {
  command: string;
  args: readonly string[];
  interceptors?: readonly Interceptor[];
  requires?: readonly string[];
  /** Directory for traces; null disables recording. */
  recordDir?: string | null;
  redaction?: RedactionOptions;
  logger?: Logger;
  seed?: number | null;
  planHash?: string | null;
  scenarioId?: string | null;
  /** Override the agent side (defaults to this process's stdin/stdout). */
  agent?: Transport;
  killGraceMs?: number;
  /** Called once the proxy exists, before any traffic. */
  onProxy?: (proxy: Proxy) => void;
  /** Called after the session ends, before the trace is closed. */
  onFinish?: (proxy: Proxy) => void;
}

export interface StdioProxyHandle {
  /** Stop the session: close the agent side, terminate the server, finish the trace. */
  stop(): Promise<number>;
  runId: string;
  tracePath: string | null;
  proxy: Proxy;
  child: ChildProcessTransport;
  /** Resolves with the exit code the wrapper should use. */
  done: Promise<number>;
}

/** `poltergeist wrap -- <command>`: spawn the server and proxy this process's stdio to it. */
export async function startStdioProxy(opts: StdioProxyOptions): Promise<StdioProxyHandle> {
  const logger = opts.logger ?? createLogger("warn");
  const runId = ulid();
  const recordDir = opts.recordDir === undefined ? ".poltergeist/runs" : opts.recordDir;
  const tracePath = recordDir === null ? null : join(recordDir, `${runId}.jsonl`);
  const sink: TraceSink = tracePath === null ? new NullTraceSink() : new FileTraceSink(tracePath, opts.redaction ?? {});

  let proxyRef: Proxy | undefined;
  const child = new ChildProcessTransport({
    command: opts.command,
    args: opts.args,
    env: process.env,
    ...(opts.killGraceMs !== undefined ? { killGraceMs: opts.killGraceMs } : {}),
    onMalformed: (line) => {
      logger.warn("upstream wrote a line that is not JSON-RPC; dropped", line.slice(0, 200));
      proxyRef?.event("malformed_message", { from: "upstream", line: line.slice(0, 2000) });
    },
  });
  const agent = opts.agent ?? new StdioServerTransport();

  const proxy = new Proxy({
    agent,
    upstream: child,
    sink,
    logger,
    runId,
    ...(opts.interceptors !== undefined ? { interceptors: opts.interceptors } : {}),
    ...(opts.requires !== undefined ? { requires: opts.requires } : {}),
    seed: opts.seed ?? null,
    planHash: opts.planHash ?? null,
    scenarioId: opts.scenarioId ?? null,
  });
  proxyRef = proxy;
  opts.onProxy?.(proxy);

  await proxy.start();

  if (opts.agent === undefined) {
    // The SDK's stdio server transport does not react to end-of-input; the agent closing stdin
    // means the session is over.
    process.stdin.once("end", () => void agent.close());
  }

  const done = (async () => {
    const who = await proxy.closed;
    if (who !== "upstream") await child.close();
    await child.exited;
    opts.onFinish?.(proxy);
    proxy.event("child_exit", { code: child.exitCode, signal: child.exitSignal });
    proxy.closeTrace();
    if (who === "upstream") return child.exitCode ?? 1;
    return 0;
  })();

  return {
    runId,
    tracePath,
    proxy,
    child,
    done,
    stop: async () => {
      await proxy.close();
      return done;
    },
  };
}
