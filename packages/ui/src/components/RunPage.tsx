import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunBundle } from "@poltergeist/core";
import { followRun, loadBundle } from "../api.js";
import { FAMILY_LABEL, agentLabel, scoreTone } from "../view-models/labels.js";
import { toTimelineRows } from "../view-models/timeline.js";
import { toVerdictPanel } from "../view-models/verdicts.js";
import { ErrorNote, HauntingChip, Loading, formatTime } from "./common.js";
import { ShrinkView } from "./ShrinkView.js";
import { Timeline, type TimelineHandle } from "./Timeline.js";

function ScoreDial({ score, capped }: { score: number; capped: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <figure className={`dial dial-${tone}`} aria-label={`Resilience score ${score} out of 100${capped ? ", capped because a secret leaked" : ""}`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={r} className="dial-track" />
        {score > 0 && <circle cx="64" cy="64" r={r} className="dial-value" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 64 64)" />}
      </svg>
      <div className="dial-text">
        <span className="dial-num">{score}</span>
        <span className="dial-label">resilience</span>
      </div>
      {capped && <figcaption className="dial-cap">Capped at 40: a secret leaked</figcaption>}
    </figure>
  );
}

export function RunPage({ runId }: { runId: string }) {
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timeline = useRef<TimelineHandle>(null);

  useEffect(() => {
    let stop = false;
    let unfollow: (() => void) | undefined;
    loadBundle(runId)
      .then((b) => {
        if (stop) return;
        setBundle(b);
        if (b.status === "running") {
          setLive(true);
          unfollow = followRun(runId, (update) => setBundle((cur) => (cur ? update(cur) : cur)), () => {
            setLive(false);
            void loadBundle(runId).then((fresh) => !stop && setBundle(fresh));
          });
        }
      })
      .catch((e: unknown) => !stop && setError(String(e)));
    return () => {
      stop = true;
      unfollow?.();
    };
  }, [runId]);

  const rows = useMemo(() => (bundle ? toTimelineRows(bundle) : []), [bundle]);
  const cards = useMemo(() => (bundle ? toVerdictPanel(bundle) : []), [bundle]);
  const jump = useCallback((seq: number) => timeline.current?.focusSeq(seq), []);

  if (error) return <ErrorNote error={error} />;
  if (!bundle) return <Loading what="the run" />;

  const fams = (["security", "task", "recovery", "truth"] as const).filter((f) => bundle.score.families[f].applicable > 0);

  return (
    <div className="page run">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#runs">← All runs</a>
      </nav>

      <section className="run-head">
        <div className="run-title">
          <p className="eyebrow">
            {bundle.scenario.id} · seed {bundle.seed}
            {bundle.trial > 1 ? ` · trial ${bundle.trial}` : ""}
            {live && <span className="tag tag-live">live</span>}
          </p>
          <h1>{bundle.scenario.task}</h1>
          <dl className="meta">
            <div>
              <dt>Agent</dt>
              <dd>
                {agentLabel(bundle.agent).name}
                {agentLabel(bundle.agent).detail && <span className="muted"> · {agentLabel(bundle.agent).detail}</span>}
              </dd>
            </div>
            <div>
              <dt>Outcome</dt>
              <dd>{bundle.status}</dd>
            </div>
            <div>
              <dt>Recorded</dt>
              <dd>{formatTime(bundle.startedAt)}</dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd className="mono small">{bundle.runId}</dd>
            </div>
          </dl>
        </div>
        <div className="run-score">
          <ScoreDial score={bundle.score.score} capped={bundle.score.capped} />
          <ul className="families" aria-label="Pass rate by family">
            {fams.map((f) => {
              const s = bundle.score.families[f];
              const pct = Math.round((s.passed / s.applicable) * 100);
              return (
                <li key={f}>
                  <span className="fam-name">{FAMILY_LABEL[f]}</span>
                  <span className="bar" aria-hidden="true">
                    <span className={`bar-fill bar-${scoreTone(pct)}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="fam-num">
                    {s.passed}/{s.applicable}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section aria-labelledby="verdicts-h">
        <h2 id="verdicts-h">Verdicts</h2>
        <ul className="verdicts">
          {cards.map((c) => (
            <li key={c.oracle} className={`verdict verdict-${c.status === "n/a" ? "na" : c.status}`}>
              <div className="verdict-top">
                <span className="verdict-status">{c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Not tested"}</span>
                <span className="verdict-family">{c.family}</span>
              </div>
              <h3>
                {c.plain} <span className="mono muted small">{c.oracle}</span>
              </h3>
              <p className="muted small">{c.question}</p>
              <p className="verdict-reason">{c.reason}</p>
              {c.seqs.length > 0 && (
                <p className="evidence">
                  Evidence:{" "}
                  {c.seqs.map((s) => (
                    <button key={s} type="button" className="seq-link" onClick={() => jump(s)}>
                      frame {s}
                    </button>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="two-col">
        <section aria-labelledby="applied-h">
          <h2 id="applied-h">What Poltergeist did</h2>
          {bundle.applied.length === 0 ? (
            <p className="muted">No haunting fired in this run (the agent never made the targeted calls).</p>
          ) : (
            <ol className="applied">
              {bundle.applied.map((a) => (
                <li key={`${a.entryIndex}-${a.seq}`}>
                  <HauntingChip id={a.haunting} />
                  <p>{a.description}</p>
                  <button type="button" className="seq-link" onClick={() => jump(a.seq)}>
                    show frame {a.seq}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="answer-h">
          <h2 id="answer-h">The agent's answer</h2>
          {bundle.answer ? <pre className="answer" tabIndex={0} aria-label="The agent's final answer">{bundle.answer}</pre> : <p className="muted">No final answer was recorded.</p>}
        </section>
      </div>

      {bundle.shrink && <ShrinkView shrink={bundle.shrink} />}

      <section aria-labelledby="timeline-h">
        <h2 id="timeline-h">
          Timeline <span className="muted small">{rows.length} messages · select one to see it, and what was changed</span>
        </h2>
        <Timeline ref={timeline} rows={rows} />
      </section>
    </div>
  );
}
