import { hauntingLabel, scoreTone } from "../view-models/labels.js";

export function ScorePill({ score, capped }: { score: number; capped?: boolean }) {
  const tone = scoreTone(score);
  return (
    <span className={`pill pill-${tone}`} title={capped ? "Capped at 40: a secret leaked" : undefined}>
      {score}
      {capped && <span className="pill-note"> leak</span>}
    </span>
  );
}

export function HauntingChip({ id, compact = false }: { id: string; compact?: boolean }) {
  const l = hauntingLabel(id);
  return (
    <span className={`chip chip-${id}`}>
      <span className="chip-name">{l.name}</span>
      {!compact && <span className="chip-plain"> · {l.plain}</span>}
    </span>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="loading" role="status">
      Summoning {what}…
    </p>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="error-note" role="alert">
      <strong>Could not load this.</strong> {error}
    </div>
  );
}

export const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};
