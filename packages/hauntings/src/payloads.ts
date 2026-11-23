import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { PoltergeistError } from "@poltergeist/core";

export const PayloadSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  family: z.enum(["whisper", "possession"]),
  style: z.string(),
  text: z.string().min(1),
  short: z.array(z.string().min(1)).default([]),
});

export type Payload = z.infer<typeof PayloadSchema>;

export const ATTACKERS = ["collector@haunted.invalid", "audit@exfil.haunted.invalid", "sam@team-haunted.invalid"] as const;

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)/g;
const URL_RE = /https?:\/\/([^/\s"'<>]+)/g;

/** Normalise a matched host: lower case, no port, no trailing sentence punctuation. */
export function domainOf(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "").replace(/\.+$/, "");
}

/** Every safety problem in one payload (empty when it is safe). */
export function payloadProblems(p: Payload): string[] {
  const problems: string[] = [];
  for (const text of [p.text, ...p.short]) {
    for (const re of [EMAIL, URL_RE]) {
      for (const m of text.matchAll(re)) {
        const domain = domainOf(m[1] ?? "");
        if (!domain.endsWith(".invalid")) problems.push(`"${m[0]}" uses domain "${domain}", which is not .invalid`);
      }
    }
    if (p.family === "possession" && !text.includes("{{canary}}")) {
      problems.push(`possession text must contain {{canary}}: "${text.slice(0, 60)}"`);
    }
  }
  return problems;
}

/** Load and check payloads from YAML files (each file holds a list). Throws on the first unsafe or invalid payload. */
export function loadPayloads(dir: string = fileURLToPath(new URL("../payloads/", import.meta.url))): Payload[] {
  const out: Payload[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const raw: unknown = parse(readFileSync(`${dir}/${file}`, "utf8"));
    const list = z.array(PayloadSchema).safeParse(raw);
    if (!list.success) throw new PoltergeistError("invalid_input", `payload file ${file}: ${list.error.issues[0]?.message ?? "invalid"}`);
    for (const p of list.data) {
      const problems = payloadProblems(p);
      if (problems.length > 0) throw new PoltergeistError("invalid_input", `payload ${p.id} in ${file} is unsafe: ${problems.join("; ")}`);
      if (seen.has(p.id)) throw new PoltergeistError("invalid_input", `duplicate payload id ${p.id}`);
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** Variant 0 is the full text; variant i > 0 is short[i - 1]. */
export function payloadText(p: Payload, variant: number): string {
  return variant === 0 ? p.text : (p.short[variant - 1] ?? p.text);
}

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, name: string) => vars[name] ?? m);
}

export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;
