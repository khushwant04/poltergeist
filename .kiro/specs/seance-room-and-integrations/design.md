# Design Document: seance-room-and-integrations

## Overview

Everything here reads the same data: the **run bundle**. The exporter builds bundles from SQLite and traces;
the Séance Room renders bundles; the live view streams bundle pieces; the MCP server and the Action
call the same runner functions as the CLI.

## Architecture

```
SQLite + traces ─► Exporter ─► bundles/*.json + index.json ─► Séance Room (static)
                                                              ▲
runner (in progress) ─► UI Server ─► SSE ─────────────────────┘
runner ◄─ poltergeist mcp (stdio tools)      runner ◄─ GitHub Action (CLI)
```

## Components and Interfaces

### Bundle (`core/bundle.ts`, shared with the UI)
```ts
interface RunBundle {
  version: 1;
  header: TraceHeader;
  scenario: { id: string; task: string };
  agent: string; trial: number; status: string;
  frames: BundleFrame[];                 // seq, dir, t, method, toolName, occurrence, msg, original?, cause?
  applied: AppliedHaunting[];
  verdicts: Verdict[];
  score: { score: number; families: Record<Family, { applicable: number; passed: number }> };
  shrink?: ShrinkResult;
}
```

### Séance Room (`packages/ui`)
- React + Vite. Routes use the URL hash: `#runs`, `#run-<id>`, `#catalogue`.
- Data loading: `fetch("bundles/index.json")`, then each bundle on demand.
- View models are pure functions in `ui/src/view-models/*.ts` (tested without a browser):
  `toTimelineRows(bundle)`, `toVerdictPanel(bundle)`, `toPlanDiff(original, minimal)`, `messageDiff(original, delivered)`.
- Timeline is virtualised (`@tanstack/react-virtual`). Diffs use a JSON-aware diff over canonical JSON lines.
- Visual language: dark night background, one accent for hauntings, red for failed security verdicts,
  plain labels beside themed ones ("Possession · injected instruction to send data").

### UI Server (`poltergeist ui --live`)
- Node `http` server; serves the built UI and `GET /events` (SSE). The runner publishes events to an in-process bus.

### MCP Server (`poltergeist mcp`)
| Tool | Input | Output |
|---|---|---|
| `haunt_catalog` | none | hauntings with id, family, description |
| `haunt_run` | `{ scenario, seed?, trials?, agent? }` | `{ runIds }` immediately; runs continue in background |
| `haunt_report` | `{ runId }` | status, score, failing verdicts with evidence excerpts |
| `haunt_replay` | `{ runId, mode: "env" \| "full" }` | replay result or divergence |
| `haunt_shrink` | `{ runId, target, budget? }` | job id; progress via `haunt_report` |
Paths are resolved with `realpath` and must sit under `<repo>/scenarios/`.

### GitHub Action (`action/action.yml`, composite)
Steps: setup Node and pnpm, install, `poltergeist run --suite $suite --agent $agent --junit junit.xml
--min-score $min --max-drop $drop --baseline $baseline`, `poltergeist export --all --out bundles`,
upload artifacts, write `$GITHUB_STEP_SUMMARY`. The exit code comes from the runner (scenarios-and-oracles Req 9.3).

### Hosted demo
`pnpm demo:build` = build UI + copy `demo/bundles/*` (recorded with the reference agent, committed) into `dist/bundles`.

## Implementation notes (as built)

- **One server, no event bus.** `poltergeist ui` builds bundles on demand from `.poltergeist/` (cached by
  trace modification time) and follows a run still being recorded by tailing its trace file over
  server-sent events. So it works with `run` and `haunt` running in other processes. A run is live until
  its trace has a `plan_summary` event. Event-stream headers are flushed immediately so clients connect at once.
- **The UI imports only `core/src/bundle.ts`** (types and `lineToFrame`, no runtime dependencies) through a
  Vite alias, so the static build stays small (about 87 kB gzipped).
- **Readable diffs.** Tool results are JSON inside strings; the diff expands embedded JSON and multi-line
  text first, and folds long unchanged stretches, so the injected lines are what the reader sees.
- **Plain labels.** Every themed name has a plain one ("Possession · bait to leak a secret"), checks have
  failure wording ("Leaked a secret"), and agents get friendly names ("Scripted, gullible · falls for possession").
- **Accessibility.** The browser smoke test runs axe on the runs, run and catalogue pages and fails on
  serious or critical violations. It caught three: link names that did not contain their visible text,
  and scrollable text boxes that keyboard users could not reach.
- **Hauntings carry `summary` and `tests`** strings for the catalogue; shrink results are linked to their
  run through `fromRunId` in the regression file.
- **Demo data** is recorded with the scripted agents (`pnpm demo:record`), so the hosted demo needs no key.
- **Kiro:** `.kiro/settings/mcp.json` registers `poltergeist mcp`, plus a disabled `haunted-house` live-mode server.

## Correctness Properties

### Property 1: Bundle round trip
For any stored run, exporting and loading the bundle gives the same frame count, verdicts and score.
**Validates: Requirements 1.1, 1.2**

### Property 2: Bundles contain no secrets
For any run whose messages contain values matching redact patterns, the exported bundle contains none of those values.
**Validates: Requirements 1.3**

### Property 3: Timeline order
For any bundle, `toTimelineRows` returns rows sorted by `seq`, one per frame, with a badge exactly on frames that have a cause.
**Validates: Requirements 2.2**

### Property 4: Message diff is faithful
For any original and delivered messages, applying the diff produced by `messageDiff` to the original gives the delivered message.
**Validates: Requirements 2.3**

### Property 5: MCP path guard
For any path string, the MCP server accepts it only if its real path is inside `scenarios/`.
**Validates: Requirements 5.3**

### Property 6: Action gate
For any suite score, baseline and thresholds, the gate fails if and only if the score is below `min-score` or dropped by more than `max-drop`.
**Validates: Requirements 6.3**

## Error Handling
- A bundle that fails validation is listed in the UI as unreadable, with the reason, instead of breaking the page.
- The MCP server returns tool errors with plain-language hints; it never crashes on bad input.

## Testing Strategy
- Properties 1–6 with fast-check (view models and guards are pure).
- One Playwright smoke test of the static demo: open the runs list, open a run, expand a haunted frame.
- An accessibility check with axe on the three main views.
