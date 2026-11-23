import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Uses the static demo build (pnpm demo:build) and a locally installed Playwright; skipped otherwise.
const DIST = resolve(import.meta.dirname, "../dist");
const require = createRequire(import.meta.url);
// The few Playwright methods this test uses (Playwright is installed globally, without local types).
interface Page {
  on(event: "pageerror", fn: (e: Error) => void): void;
  goto(url: string): Promise<unknown>;
  waitForSelector(sel: string): Promise<unknown>;
  selectOption(sel: string, value: string): Promise<unknown>;
  click(sel: string): Promise<void>;
  textContent(sel: string): Promise<string | null>;
  addScriptTag(o: { content: string }): Promise<unknown>;
  evaluate(expr: string): Promise<unknown>;
  locator(sel: string): { count(): Promise<number> };
}
interface Playwright {
  chromium: { launch(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> };
}
let playwright: Playwright | undefined;
try {
  playwright = require("playwright") as Playwright;
} catch {
  playwright = undefined;
}
const ready = playwright !== undefined && existsSync(join(DIST, "bundles", "index.json"));

let server: Server;
let base = "";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

beforeAll(async () => {
  if (!ready) return;
  server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = resolve(DIST, `.${p === "/" ? "/index.html" : p}`);
    if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

describe.skipIf(!ready)("static Séance Room (browser)", () => {
  it("lists runs, opens the worst one, shows the injected text, and passes an accessibility audit", async () => {
    const browser = await playwright!.chromium.launch();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const audit = async () => {
      await page.addScriptTag({ content: readFileSync(require.resolve("axe-core/axe.min.js"), "utf8") });
      const res = (await page.evaluate("axe.run(document, { resultTypes: ['violations'] })")) as { violations: Array<{ id: string; impact: string; nodes: unknown[] }> };
      return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
    };
    try {
      await page.goto(`${base}#runs`);
      await page.waitForSelector("table.runs tbody tr");
      expect(await audit()).toEqual([]);

      await page.selectOption("#sort-runs", "score-asc");
      await page.click("table.runs tbody tr:first-child a.row-link");
      await page.waitForSelector(".verdict-fail");
      await page.click(".tl-item.haunted .tl-row");
      await page.waitForSelector(".dl-add");
      expect(await page.textContent(".diff")).toContain("PG-");
      expect(await audit()).toEqual([]);

      await page.goto(`${base}#catalogue`);
      await page.waitForSelector(".haunting-card");
      expect(await page.locator(".haunting-card").count()).toBe(6);
      expect(await audit()).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
