import type { BundleShrink } from "@poltergeist/core";
import { oracleLabel } from "../view-models/labels.js";
import { toPlanDiff } from "../view-models/plan-diff.js";

export function ShrinkView({ shrink }: { shrink: BundleShrink }) {
  const rows = toPlanDiff(shrink.original, shrink.minimal);
  return (
    <section className="shrink" aria-labelledby="shrink-h">
      <h2 id="shrink-h">Shrunk to the cause</h2>
      <p>
        <strong>
          {shrink.original.entries.length} hauntings → {shrink.minimal.entries.length}
        </strong>{" "}
        still fail <em>{oracleLabel(shrink.target).plain}</em> ({shrink.target}) in {Math.round(shrink.failureRate * 100)}% of {shrink.confirmTrials} fresh runs
        {shrink.status === "partial" ? " (budget ran out; best so far)" : ""}.
      </p>
      <ul className="plan-diff">
        {rows.map((r, i) => (
          <li key={i} className={r.kept ? "kept" : "removed"}>
            <span className="pd-mark" aria-hidden="true">{r.kept ? "●" : "○"}</span>
            <span className="pd-name">
              {r.name} <span className="muted">· {r.plain}</span>
            </span>
            <span className="mono small">{r.target}</span>
            <span className="small">{r.kept ? (r.shrunkParams ? "kept, payload shrunk" : "kept") : "not needed"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
