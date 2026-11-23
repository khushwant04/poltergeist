import { useEffect, useMemo, useState } from "react";
import type { BundleIndex } from "@poltergeist/core";
import { loadIndex } from "../api.js";
import { agentLabel, oracleLabel } from "../view-models/labels.js";
import { ErrorNote, HauntingChip, Loading, ScorePill, formatTime } from "./common.js";

type Sort = "newest" | "score-asc" | "score-desc";

export function RunsPage() {
  const [index, setIndex] = useState<BundleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState("all");
  const [agent, setAgent] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");

  useEffect(() => {
    let stop = false;
    const load = () =>
      loadIndex()
        .then((i) => !stop && setIndex(i))
        .catch((e: unknown) => !stop && setError(String(e)));
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  const runs = useMemo(() => {
    const list = (index?.runs ?? []).filter((r) => (scenario === "all" || r.scenarioId === scenario) && (agent === "all" || r.agent === agent));
    if (sort === "score-asc") return [...list].sort((a, b) => a.score - b.score);
    if (sort === "score-desc") return [...list].sort((a, b) => b.score - a.score);
    return list;
  }, [index, scenario, agent, sort]);

  if (error) return <ErrorNote error={error} />;
  if (!index) return <Loading what="runs" />;

  const scenarios = [...new Set(index.runs.map((r) => r.scenarioId))].sort();
  const agents = [...new Set(index.runs.map((r) => r.agent))].sort();
  const avg = runs.length ? Math.round((runs.reduce((s, r) => s + r.score, 0) / runs.length) * 10) / 10 : 0;
  const leaks = runs.filter((r) => r.failing.includes("canary-leak")).length;
  const obeyed = runs.filter((r) => r.failing.includes("injection-obedience")).length;
  const shrunk = runs.filter((r) => r.hasShrink).length;

  return (
    <div className="page">
      <section className="hero">
        <h1>The Séance Room</h1>
        <p className="lede">
          Every run where Poltergeist haunted an agent: what it injected, what the agent did, and why it passed or failed.
        </p>
        <dl className="stats">
          <div>
            <dt>Runs</dt>
            <dd>{runs.length}</dd>
          </div>
          <div>
            <dt>Resilience score</dt>
            <dd>
              <ScorePill score={avg} />
            </dd>
          </div>
          <div>
            <dt>Secrets leaked</dt>
            <dd className={leaks ? "bad" : ""}>{leaks}</dd>
          </div>
          <div>
            <dt>Obeyed injected orders</dt>
            <dd className={obeyed ? "bad" : ""}>{obeyed}</dd>
          </div>
          <div>
            <dt>Shrunk to a one-line bug</dt>
            <dd>{shrunk}</dd>
          </div>
        </dl>
      </section>

      <div className="toolbar" role="group" aria-label="Filter and sort runs">
        <label>
          Scenario
          <select id="filter-scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="all">All scenarios</option>
            {scenarios.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Agent
          <select id="filter-agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select id="sort-runs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="score-asc">Lowest score first</option>
            <option value="score-desc">Highest score first</option>
          </select>
        </label>
      </div>

      {runs.length === 0 ? (
        <div className="empty">
          <p>No runs yet.</p>
          <p className="muted">
            Run <code>poltergeist run --suite ci</code>, then refresh.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="runs">
            <thead>
              <tr>
                <th scope="col">Score</th>
                <th scope="col">Scenario</th>
                <th scope="col">Agent</th>
                <th scope="col">Hauntings</th>
                <th scope="col">What went wrong</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId} className={r.live ? "live" : undefined}>
                  <td>
                    <a className="row-link" href={`#run-${r.runId}`}>
                      <ScorePill score={r.score} capped={r.capped} />
                      <span className="sr-only">
                        {" "}
                        open {r.scenarioId} seed {r.seed}
                      </span>
                    </a>
                  </td>
                  <td>
                    <span className="strong block">{r.scenarioId}</span>
                    <span className="muted small">seed {r.seed}{r.trial > 1 ? ` · trial ${r.trial}` : ""}</span>
                    {r.hasShrink && <span className="tag">shrunk</span>}
                    {r.live && <span className="tag tag-live">live</span>}
                  </td>
                  <td>
                    <span className="agent-name">{agentLabel(r.agent).name}</span>
                    {agentLabel(r.agent).detail && <span className="muted small block">{agentLabel(r.agent).detail}</span>}
                  </td>
                  <td>
                    <div className="chips">
                      {r.hauntings.length === 0 ? <span className="muted small">none fired</span> : r.hauntings.map((h) => <HauntingChip key={h} id={h} compact />)}
                    </div>
                  </td>
                  <td className="small">{r.failing.length === 0 ? <span className="ok">Nothing</span> : <span className="bad">{r.failing.map((f) => oracleLabel(f).failed).join(", ")}</span>}</td>
                  <td className="small muted nowrap">{formatTime(r.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
