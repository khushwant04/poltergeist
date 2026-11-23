import { CATALOG_VERSION, PoltergeistError } from "@poltergeist/core";
import type { AnyHaunting } from "../types.js";
import { errorStorm } from "./error-storm.js";
import { liar } from "./liar.js";
import { possession } from "./possession.js";
import { rugPull } from "./rug-pull.js";
import { vanish } from "./vanish.js";
import { whisper } from "./whisper.js";

export { errorStorm, liar, possession, rugPull, vanish, whisper };

export interface Catalog {
  version: string;
  hauntings: readonly AnyHaunting[];
  byId: ReadonlyMap<string, AnyHaunting>;
}

/** Build a catalog sorted by id. Rejects duplicate ids. */
export function makeCatalog(hauntings: readonly AnyHaunting[], version = CATALOG_VERSION): Catalog {
  const sorted = [...hauntings].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map<string, AnyHaunting>();
  for (const h of sorted) {
    if (byId.has(h.id)) throw new PoltergeistError("invalid_input", `duplicate haunting id "${h.id}"`);
    byId.set(h.id, h);
  }
  return { version, hauntings: sorted, byId };
}

export const CATALOG: Catalog = makeCatalog([whisper, possession, rugPull, vanish, liar, errorStorm]);
