import { lineToFrame, type BundleIndex, type CatalogEntry, type RunBundle } from "@poltergeist/core";

const base = "bundles";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const loadIndex = () => getJson<BundleIndex>(`${base}/index.json`);
export const loadBundle = (runId: string) => getJson<RunBundle>(`${base}/${encodeURIComponent(runId)}.json`);
export const loadCatalog = () => getJson<CatalogEntry[]>(`${base}/catalog.json`).catch(() => [] as CatalogEntry[]);

/**
 * Live view: follow a run that is still being recorded. Only available from `poltergeist ui`
 * (the static demo has no event stream). Returns a function that stops following.
 */
export function followRun(runId: string, onUpdate: (update: (b: RunBundle) => RunBundle) => void, onEnd: () => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const es = new EventSource(`events?run=${encodeURIComponent(runId)}`);
  es.addEventListener("line", (e) => {
    const line = JSON.parse((e as MessageEvent<string>).data) as { type: string; name?: string; detail?: Record<string, unknown> };
    if (line.type === "frame") {
      const frame = lineToFrame(line as Parameters<typeof lineToFrame>[0]);
      onUpdate((b) => (b.frames.some((f) => f.seq === frame.seq) ? b : { ...b, frames: [...b.frames, frame] }));
    } else if (line.type === "event" && line.name === "haunting_applied" && line.detail) {
      const d = line.detail as unknown as RunBundle["applied"][number];
      onUpdate((b) => (b.applied.some((a) => a.seq === d.seq && a.entryIndex === d.entryIndex) ? b : { ...b, applied: [...b.applied, d] }));
    }
  });
  es.addEventListener("end", () => {
    es.close();
    onEnd();
  });
  es.onerror = () => es.close();
  return () => es.close();
}
