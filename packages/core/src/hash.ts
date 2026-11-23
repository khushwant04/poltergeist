import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";

/** sha256 (hex) of the canonical JSON of `value`. */
export function hashOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
