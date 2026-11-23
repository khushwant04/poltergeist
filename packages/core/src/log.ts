export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const order: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

export interface Logger {
  error(msg: string, detail?: unknown): void;
  warn(msg: string, detail?: unknown): void;
  info(msg: string, detail?: unknown): void;
  debug(msg: string, detail?: unknown): void;
}

/** Logs go to stderr only: stdout is the MCP protocol channel. */
export function createLogger(
  level: LogLevel = "info",
  sink: (line: string) => void = (l) => void process.stderr.write(l),
): Logger {
  const write = (lvl: Exclude<LogLevel, "silent">, msg: string, detail?: unknown) => {
    if (order[lvl] > order[level]) return;
    const suffix = detail === undefined ? "" : ` ${safeStringify(detail)}`;
    sink(`[poltergeist] ${lvl}: ${msg}${suffix}\n`);
  };
  return {
    error: (m, d) => write("error", m, d),
    warn: (m, d) => write("warn", m, d),
    info: (m, d) => write("info", m, d),
    debug: (m, d) => write("debug", m, d),
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
