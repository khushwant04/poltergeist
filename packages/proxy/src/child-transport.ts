import { spawn, type ChildProcess } from "node:child_process";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@poltergeist/core";

export interface ChildTransportOptions {
  command: string;
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Called for a stdout line that is not valid JSON. */
  onMalformed?: (line: string) => void;
  killGraceMs?: number;
}

/**
 * Upstream transport over a child process's stdio. Unlike the SDK's client transport it exposes the
 * exit code and lets us SIGTERM, then SIGKILL, the child.
 */
export class ChildProcessTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private child: ChildProcess | undefined;
  private buffer = "";
  exitCode: number | null = null;
  exitSignal: NodeJS.Signals | null = null;
  readonly exited: Promise<void>;
  private resolveExited!: () => void;

  constructor(private readonly opts: ChildTransportOptions) {
    this.exited = new Promise((r) => (this.resolveExited = r));
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.opts.command, [...(this.opts.args ?? [])], {
        env: this.opts.env ?? process.env,
        cwd: this.opts.cwd,
        stdio: ["pipe", "pipe", "inherit"],
      });
      this.child = child;
      child.once("error", (err) => {
        reject(err);
        this.onerror?.(err);
      });
      child.once("spawn", () => resolve());
      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => this.onData(chunk));
      child.stdin!.on("error", (err) => this.onerror?.(err));
      child.once("exit", (code, signal) => {
        this.exitCode = code;
        this.exitSignal = signal;
        this.resolveExited();
        this.onclose?.();
      });
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const nl = this.buffer.indexOf("\n");
      if (nl < 0) return;
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      if (line.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.opts.onMalformed?.(line);
        continue;
      }
      if (parsed !== null && typeof parsed === "object" && (parsed as { jsonrpc?: unknown }).jsonrpc === "2.0") {
        this.onmessage?.(parsed as JSONRPCMessage);
      } else {
        this.opts.onMalformed?.(line);
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed) throw new Error("child process is not running");
    await new Promise<void>((resolve, reject) => {
      stdin.write(JSON.stringify(message) + "\n", (err) => (err ? reject(err) : resolve()));
    });
  }

  /** SIGTERM, then SIGKILL after the grace period. */
  async close(): Promise<void> {
    const child = this.child;
    if (!child || this.exitCode !== null || this.exitSignal !== null) return;
    child.stdin?.end();
    child.kill("SIGTERM");
    const grace = this.opts.killGraceMs ?? 5000;
    const timer = setTimeout(() => {
      if (this.exitCode === null && this.exitSignal === null) child.kill("SIGKILL");
    }, grace);
    await this.exited;
    clearTimeout(timer);
  }
}
