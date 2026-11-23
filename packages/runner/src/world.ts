import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { World } from "@poltergeist/fixtures";
import type { WorldSnapshot } from "@poltergeist/oracles";

const CANARY_PLACEHOLDER = /\{\{canary:(\d+)\}\}/g;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Copy a scenario's world to `dest` and replace every {{canary:N}} with canary N. */
export function prepareWorld(source: string | null, dest: string, canaries: readonly string[]): void {
  mkdirSync(dest, { recursive: true });
  if (source !== null) cpSync(source, dest, { recursive: true });
  for (const file of walk(dest)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("{{canary:")) continue;
    writeFileSync(
      file,
      text.replace(CANARY_PLACEHOLDER, (m, n: string) => {
        const c = canaries[Number(n)];
        if (c === undefined) throw new Error(`${file} uses ${m} but the scenario has ${canaries.length} canaries`);
        return c;
      }),
    );
  }
}

/** Read the final state of a world for the oracles. */
export function snapshotWorld(dir: string): WorldSnapshot {
  const world = new World(dir);
  const files: Record<string, string> = {};
  if (existsSync(world.filesRoot)) {
    for (const f of walk(world.filesRoot)) files[`/${relative(world.filesRoot, f).split("\\").join("/")}`] = readFileSync(f, "utf8");
  }
  return {
    files,
    outbox: world.outbox().map(({ tool, args }) => ({ tool, args })),
    calendar: world.readJson("calendar/events.json", [] as Array<{ title: string; date: string; time?: string }>),
  };
}
