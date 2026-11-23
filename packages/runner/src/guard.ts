import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { PoltergeistError } from "@poltergeist/core";

/**
 * Resolve a scenario reference from an untrusted caller (the MCP server): an id like "inbox-summary",
 * or a path that must stay inside `<root>/scenarios` after following symlinks.
 */
export function resolveScenarioRef(root: string, ref: string): string {
  const base = resolve(root, "scenarios");
  const realBase = existsSync(base) ? realpathSync(base) : base;
  const inside = (p: string) => p === realBase || p.startsWith(realBase + sep);
  if (/^[a-z0-9][a-z0-9-]*$/.test(ref)) {
    const p = join(realBase, `${ref}.yaml`);
    if (!existsSync(p)) throw new PoltergeistError("invalid_input", `no scenario "${ref}"`);
    return p;
  }
  if (ref.includes("\0")) throw new PoltergeistError("invalid_input", "invalid scenario path");
  const candidate = isAbsolute(ref) ? resolve(ref) : resolve(root, ref);
  if (!existsSync(candidate)) throw new PoltergeistError("invalid_input", `no scenario at ${ref}`);
  const real = realpathSync(candidate);
  if (!inside(real) || !/\.ya?ml$/.test(real)) {
    throw new PoltergeistError("invalid_input", `scenario paths must point to a .yaml file inside ${base}`);
  }
  return real;
}
