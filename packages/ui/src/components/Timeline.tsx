import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { TimelineRow } from "../view-models/timeline.js";
import { FrameDetail } from "./FrameDetail.js";

export interface TimelineHandle {
  focusSeq(seq: number): void;
}

const DIR_LABEL = { c2s: "Agent → server", s2c: "Server → agent" } as const;

export const Timeline = forwardRef<TimelineHandle, { rows: TimelineRow[] }>(function Timeline({ rows }, ref) {
  const parent = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 52, overscan: 8 });

  useImperativeHandle(ref, () => ({
    focusSeq(seq: number) {
      const i = rows.findIndex((r) => r.seq === seq);
      if (i < 0) return;
      parent.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      virtual.scrollToIndex(i, { align: "center" });
      setOpen(seq);
      setFlash(seq);
      setTimeout(() => setFlash(null), 1600);
    },
  }));

  return (
    <div ref={parent} className="timeline" role="list" aria-label="Messages in this run">
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((v) => {
          const r = rows[v.index]!;
          const isOpen = open === r.seq;
          return (
            <div
              key={r.seq}
              ref={virtual.measureElement}
              data-index={v.index}
              role="listitem"
              className={`tl-item ${r.haunting ? "haunted" : ""} ${flash === r.seq ? "flash" : ""}`}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
            >
              <button
                type="button"
                className={`tl-row dir-${r.dir}`}
                aria-expanded={isOpen}
                aria-controls={`frame-${r.seq}`}
                onClick={() => setOpen(isOpen ? null : r.seq)}
              >
                <span className="tl-seq mono">{r.seq}</span>
                <span className="tl-dir" title={DIR_LABEL[r.dir]}>
                  <span aria-hidden="true">{r.dir === "c2s" ? "→" : "←"}</span>
                  <span className="sr-only">{DIR_LABEL[r.dir]}</span>
                </span>
                <span className="tl-label mono">{r.label}</span>
                <span className="tl-badges">
                  {r.haunting && (
                    <span className={`chip chip-${r.haunting.id}`}>
                      <span className="chip-name">{r.haunting.name}</span>
                      <span className="chip-plain"> · {r.haunting.plain}</span>
                    </span>
                  )}
                  {r.delivery !== "sent" && <span className={`tag tag-${r.delivery}`}>{r.delivery}</span>}
                  {r.injected && <span className="tag">injected</span>}
                  {r.copy !== undefined && <span className="tag">copy {r.copy}</span>}
                  {r.isError && <span className="tag tag-error">error</span>}
                </span>
                <span className="tl-preview">{r.preview}</span>
              </button>
              {isOpen && (
                <div id={`frame-${r.seq}`} className="tl-detail">
                  <FrameDetail row={r} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
