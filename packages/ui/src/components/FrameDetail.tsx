import { useMemo } from "react";
import { foldDiff, messageDiff, prettyLines } from "../view-models/message-diff.js";
import type { TimelineRow } from "../view-models/timeline.js";

export function FrameDetail({ row }: { row: TimelineRow }) {
  const f = row.frame;
  const diff = useMemo(() => (f.original ? messageDiff(f.original, f.msg) : null), [f]);

  if (!diff) {
    return (
      <div className="frame">
        <p className="frame-note">
          {row.delivery === "dropped" ? "Poltergeist swallowed this message: the agent never received it." : "Delivered unchanged."}
        </p>
        <pre className="json" tabIndex={0} aria-label={`Message ${row.seq}`}>{prettyLines(f.msg).join("\n")}</pre>
      </div>
    );
  }
  const added = diff.filter((d) => d.op === "add").length;
  const removed = diff.filter((d) => d.op === "del").length;
  return (
    <div className="frame">
      <p className="frame-note">
        Poltergeist changed this message before the agent saw it: <span className="add-count">+{added}</span> /{" "}
        <span className="del-count">−{removed}</span> lines.
      </p>
      <pre className="json diff" tabIndex={0} aria-label="Changes between what the server sent and what the agent received">
        {foldDiff(diff).map((g, gi) =>
          g.kind === "fold" ? (
            <span key={gi} className="dl dl-fold">
              ⋯ {g.count} unchanged line{g.count === 1 ? "" : "s"}
              {"\n"}
            </span>
          ) : (
            g.ops.map((d, i) => (
              <span key={`${gi}-${i}`} className={`dl dl-${d.op}`}>
                <span className="dl-mark" aria-hidden="true">{d.op === "add" ? "+" : d.op === "del" ? "−" : " "}</span>
                <span className="sr-only">{d.op === "add" ? "added: " : d.op === "del" ? "removed: " : ""}</span>
                {d.line}
                {"\n"}
              </span>
            ))
          ),
        )}
      </pre>
    </div>
  );
}
