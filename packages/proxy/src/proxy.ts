import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CATALOG_VERSION,
  FAST_CHECK_VERSION,
  POLTERGEIST_VERSION,
  RealClock,
  createLogger,
  type Clock,
  type Direction,
  type Interceptor,
  type JSONRPCMessage,
  type Logger,
  type TraceHeader,
} from "@poltergeist/core";
import { ulid } from "ulid";
import { classify } from "./classify.js";
import { EffectExecutor } from "./executor.js";
import { initializeRewriter } from "./initialize-rewriter.js";
import { Pipeline } from "./pipeline.js";
import { NullTraceSink, type TraceSink } from "./recorder.js";

export interface ProxyOptions {
  agent: Transport;
  upstream: Transport;
  interceptors?: readonly Interceptor[];
  requires?: readonly string[];
  clock?: Clock;
  sink?: TraceSink;
  logger?: Logger;
  runId?: string;
  seed?: number | null;
  planHash?: string | null;
  scenarioId?: string | null;
  holdTimeoutMs?: number;
}

/**
 * Forwards MCP messages between an agent-side transport and an upstream transport,
 * running each one through the interceptor pipeline and recording the run.
 */
export class Proxy {
  readonly runId: string;
  readonly pipeline: Pipeline;
  private readonly executor: EffectExecutor;
  private readonly sink: TraceSink;
  private readonly logger: Logger;
  private readonly cancelled = new Set<string>();
  private closing = false;
  private resolveClosed!: (who: "agent" | "upstream" | "proxy") => void;
  /** Resolves with the side that closed first. */
  readonly closed: Promise<"agent" | "upstream" | "proxy">;

  constructor(private readonly opts: ProxyOptions) {
    const clock = opts.clock ?? new RealClock();
    this.runId = opts.runId ?? ulid();
    this.sink = opts.sink ?? new NullTraceSink();
    this.logger = opts.logger ?? createLogger("warn");
    this.closed = new Promise((r) => (this.resolveClosed = r));

    this.pipeline = new Pipeline(
      [initializeRewriter, ...(opts.interceptors ?? [])],
      clock,
      { requires: new Set(opts.requires ?? []) },
      (e) => this.sink.write({ type: "event", t: this.pipeline.elapsed(), name: e.name, detail: e.detail }),
    );
    this.executor = new EffectExecutor({
      clock,
      nextSeq: () => this.pipeline.nextSeq(),
      elapsed: () => this.pipeline.elapsed(),
      deliver: (dir, msg) => this.deliver(dir, msg),
      record: (line) => this.sink.write(line),
      ...(opts.holdTimeoutMs !== undefined ? { holdTimeoutMs: opts.holdTimeoutMs } : {}),
    });

    const header: TraceHeader = {
      type: "header",
      runId: this.runId,
      versions: { poltergeist: POLTERGEIST_VERSION, catalog: CATALOG_VERSION, fastCheck: FAST_CHECK_VERSION },
      seed: opts.seed ?? null,
      planHash: opts.planHash ?? null,
      scenarioId: opts.scenarioId ?? null,
      startedAt: new Date(clock.now()).toISOString(),
    };
    this.sink.write(header);
  }

  async start(): Promise<void> {
    const { agent, upstream } = this.opts;
    agent.onmessage = (msg) => this.handle("c2s", msg);
    upstream.onmessage = (msg) => this.handle("s2c", msg);
    agent.onerror = (err) => {
      if (!this.closing) this.logger.warn("agent transport error", String(err));
    };
    upstream.onerror = (err) => {
      if (!this.closing) this.logger.warn("upstream transport error", String(err));
    };
    agent.onclose = () => void this.shutdown("agent");
    upstream.onclose = () => void this.shutdown("upstream");
    await upstream.start();
    await agent.start();
  }

  /** Feed one message in (exposed for tests and custom transports). */
  handle(dir: Direction, msg: JSONRPCMessage): void {
    const c = classify(msg);
    if (dir === "c2s" && c.kind === "notification" && c.method === "notifications/cancelled") {
      const id = c.params?.["requestId"];
      if (typeof id === "string" || typeof id === "number") this.cancelled.add(`${typeof id}:${String(id)}`);
    }
    if (dir === "s2c" && c.kind === "response" && this.cancelled.delete(`${typeof c.id}:${String(c.id)}`)) {
      this.pipeline.correlator.resolve("s2c", c.id);
      this.sink.write({
        type: "event",
        t: this.pipeline.elapsed(),
        name: "late_response_discarded",
        detail: { id: c.id },
      });
      return;
    }
    this.executor.execute(this.pipeline.process(dir, msg));
  }

  private deliver(dir: Direction, msg: JSONRPCMessage): void {
    const target = dir === "c2s" ? this.opts.upstream : this.opts.agent;
    target.send(msg).catch((err: unknown) => this.logger.warn(`failed to deliver ${dir} message`, String(err)));
  }

  /** Record an event in the trace (used by transports and runners). */
  event(name: "child_exit" | "malformed_message", detail: Record<string, unknown>): void {
    this.sink.write({ type: "event", t: this.pipeline.elapsed(), name, detail });
  }

  async close(): Promise<void> {
    await this.shutdown("proxy");
  }

  private async shutdown(who: "agent" | "upstream" | "proxy"): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.resolveClosed(who);
    const other = who === "agent" ? [this.opts.upstream] : who === "upstream" ? [this.opts.agent] : [this.opts.agent, this.opts.upstream];
    await Promise.allSettled(other.map((t) => t.close()));
  }

  /** Flush and close the trace. Call after the last event has been recorded. */
  closeTrace(): void {
    this.sink.close();
  }
}
