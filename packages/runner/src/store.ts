import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Score, Verdict } from "@poltergeist/oracles";

// node:sqlite is built in (no native build for users), but still prints an experimental warning.
const emit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (String(warning instanceof Error ? warning.message : warning).includes("SQLite")) return;
  (emit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
const { DatabaseSync } = await import("node:sqlite");

export interface StoredRun {
  id: string;
  scenarioId: string;
  agent: string;
  seed: number;
  trial: number;
  planHash: string;
  status: string;
  score: number;
  tracePath: string;
  worldDir: string;
  startedAt: string;
  verdicts: Verdict[];
  scoreDetail: Score;
}

/** Runs, verdicts and scores in one SQLite file. */
export class Store {
  private readonly db: InstanceType<typeof DatabaseSync>;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, scenario_id TEXT, agent TEXT, seed INTEGER, trial INTEGER, plan_hash TEXT,
        status TEXT, score REAL, trace_path TEXT, world_dir TEXT, started_at TEXT, score_json TEXT
      );
      CREATE TABLE IF NOT EXISTS verdicts (
        run_id TEXT, oracle TEXT, family TEXT, applicable INTEGER, pass INTEGER, reason TEXT, evidence_json TEXT
      );
      CREATE TABLE IF NOT EXISTS suites (id TEXT PRIMARY KEY, name TEXT, score REAL, run_ids TEXT, created_at TEXT);
    `);
  }

  saveRun(r: StoredRun): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO runs (id, scenario_id, agent, seed, trial, plan_hash, status, score, trace_path, world_dir, started_at, score_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(r.id, r.scenarioId, r.agent, r.seed, r.trial, r.planHash, r.status, r.score, r.tracePath, r.worldDir, r.startedAt, JSON.stringify(r.scoreDetail));
    this.db.prepare("DELETE FROM verdicts WHERE run_id = ?").run(r.id);
    const insert = this.db.prepare("INSERT INTO verdicts (run_id, oracle, family, applicable, pass, reason, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const v of r.verdicts) insert.run(r.id, v.oracle, v.family, v.applicable ? 1 : 0, v.pass ? 1 : 0, v.reason, JSON.stringify(v.evidence));
  }

  getRun(id: string): StoredRun | undefined {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const verdicts = (this.db.prepare("SELECT * FROM verdicts WHERE run_id = ? ORDER BY rowid").all(id) as Array<Record<string, unknown>>).map(
      (v): Verdict => ({
        oracle: v["oracle"] as Verdict["oracle"],
        family: v["family"] as Verdict["family"],
        applicable: v["applicable"] === 1,
        pass: v["pass"] === 1,
        reason: String(v["reason"]),
        evidence: JSON.parse(String(v["evidence_json"])) as Verdict["evidence"],
      }),
    );
    return {
      id: String(row["id"]),
      scenarioId: String(row["scenario_id"]),
      agent: String(row["agent"]),
      seed: Number(row["seed"]),
      trial: Number(row["trial"]),
      planHash: String(row["plan_hash"]),
      status: String(row["status"]),
      score: Number(row["score"]),
      tracePath: String(row["trace_path"]),
      worldDir: String(row["world_dir"]),
      startedAt: String(row["started_at"]),
      verdicts,
      scoreDetail: JSON.parse(String(row["score_json"])) as Score,
    };
  }

  listRuns(limit = 50): Array<Pick<StoredRun, "id" | "scenarioId" | "agent" | "seed" | "trial" | "status" | "score" | "startedAt">> {
    return (this.db.prepare("SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r["id"]),
      scenarioId: String(r["scenario_id"]),
      agent: String(r["agent"]),
      seed: Number(r["seed"]),
      trial: Number(r["trial"]),
      status: String(r["status"]),
      score: Number(r["score"]),
      startedAt: String(r["started_at"]),
    }));
  }

  saveSuite(id: string, name: string, score: number, runIds: string[], createdAt: string): void {
    this.db.prepare("INSERT OR REPLACE INTO suites (id, name, score, run_ids, created_at) VALUES (?, ?, ?, ?, ?)").run(id, name, score, JSON.stringify(runIds), createdAt);
  }

  close(): void {
    this.db.close();
  }
}
