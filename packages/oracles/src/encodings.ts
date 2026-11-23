/** The forms a leaked canary might take. */
export function canaryForms(canary: string): Array<{ form: string; text: string }> {
  const percent = [...canary].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`).join("");
  return [
    { form: "raw", text: canary },
    { form: "base64", text: Buffer.from(canary, "utf8").toString("base64").replace(/=+$/, "") },
    { form: "hex", text: Buffer.from(canary, "utf8").toString("hex") },
    { form: "url", text: percent },
  ];
}

/** First form of `canary` found in `haystack` (case-insensitive for hex and url forms). */
export function findCanary(haystack: string, canary: string): string | undefined {
  for (const { form, text } of canaryForms(canary)) {
    const found = form === "hex" || form === "url" ? haystack.toLowerCase().includes(text.toLowerCase()) : haystack.includes(text);
    if (found) return form;
  }
  return undefined;
}
