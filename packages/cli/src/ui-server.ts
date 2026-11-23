import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunBundle } from "@poltergeist/core";
import { Store, buildBundle, catalogEntries, homeDir, indexEntry, recordedRunIds } from "@poltergeist/runner";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export interface UiServerOptions {
  home?: string;
  port: number;
  host?: string;
  regressionsDir?: string;
  /** Built UI (defaults to packages/ui/dist next to this package). */
  staticDir?: string;
}

/** Serves the Séance Room from local runs: bundles on demand, plus a live event stream per run. */
export async function startUiServer(opts: UiServerOptions): Promise<{ url: string; close(): Promise<void> }> {
  const home = homeDir(opts.home);
  const staticDir = resolve(opts.staticDir ?? fileURLToPath(new URL("../../ui/dist/", import.meta.url)));
  const cache = new Map<string, { mtime: number; bundle: RunBundle }>();

  const tracePath = (id: string) => join(home, "runs", `${id}.jsonl`);
  const isLive = (id: string) => !readFileSync(tracePath(id), "utf8").includes('"name":"plan_summary"');

  async function bundleFor(id: string, store?: Store): Promise<RunBundle> {
    const mtime = statSync(tracePath(id)).mtimeMs;
    const hit = cache.get(id);
    if (hit && hit.mtime === mtime) return hit.bundle;
    const b = await buildBundle(id, { home, regressionsDir: opts.regressionsDir ?? "scenarios/regressions", ...(store ? { store } : {}) });
    if (isLive(id)) b.status = "running";
    cache.set(id, { mtime, bundle: b });
    return b;
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": TYPES[".json"]!, "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const p = url.pathname;
      const dbPath = join(home, "poltergeist.db");
      if (p === "/bundles/index.json") {
        const store = existsSync(dbPath) ? new Store(dbPath) : undefined;
        try {
          const runs = [];
          for (const id of recordedRunIds(home).slice(0, 300)) {
            try {
              const b = await bundleFor(id, store);
              runs.push(indexEntry(b, b.status === "running"));
            } catch {
              // a trace without a scenario context (plain `wrap`) is not a Séance Room run
            }
          }
          return json(res, 200, { version: 1, generatedAt: new Date().toISOString(), runs });
        } finally {
          store?.close();
        }
      }
      if (p === "/bundles/catalog.json") return json(res, 200, catalogEntries());
      const m = /^\/bundles\/([0-9A-Za-z_-]+)\.json$/.exec(p);
      if (m) {
        if (!existsSync(tracePath(m[1]!))) return json(res, 404, { error: "no such run" });
        const store = existsSync(dbPath) ? new Store(dbPath) : undefined;
        try {
          return json(res, 200, await bundleFor(m[1]!, store));
        } finally {
          store?.close();
        }
      }
      if (p === "/events") {
        const id = url.searchParams.get("run") ?? "";
        if (!/^[0-9A-Za-z_-]+$/.test(id) || !existsSync(tracePath(id))) return json(res, 404, { error: "no such run" });
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        // Send headers now (Node waits for the first body write otherwise) so the client connects at once.
        res.flushHeaders();
        res.write(": following run\n\n");
        let offset = statSync(tracePath(id)).size;
        let buffer = "";
        const timer = setInterval(() => {
          const size = statSync(tracePath(id)).size;
          if (size <= offset) return;
          const fd = readFileSync(tracePath(id)).subarray(offset, size).toString("utf8");
          offset = size;
          buffer += fd;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            res.write(`event: line\ndata: ${line}\n\n`);
            if (line.includes('"name":"plan_summary"')) {
              res.write("event: end\ndata: {}\n\n");
              clearInterval(timer);
              res.end();
              return;
            }
          }
        }, 250);
        req.on("close", () => clearInterval(timer));
        return;
      }
      // Static files (the built UI), never outside the static directory.
      const rel = normalize(decodeURIComponent(p === "/" ? "/index.html" : p)).replace(/^([/\\])+/, "");
      const file = resolve(staticDir, rel);
      if (!file.startsWith(staticDir + sep) || !existsSync(file) || !statSync(file).isFile()) {
        if (!existsSync(join(staticDir, "index.html"))) return json(res, 500, { error: "the UI is not built; run pnpm build" });
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    })().catch((err: unknown) => json(res, 500, { error: String(err) }));
  });

  await new Promise<void>((r) => server.listen(opts.port, opts.host ?? "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return {
    url: `http://${opts.host ?? "127.0.0.1"}:${addr.port}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
