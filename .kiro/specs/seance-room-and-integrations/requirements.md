# Requirements Document

## Introduction

This spec covers how people and tools see Poltergeist's results: run bundles, the Séance Room web UI,
the live view, the MCP server that lets Kiro and other IDEs drive Poltergeist, the GitHub Action, and
the hosted demo that judges can open without an API key.

## Glossary

- **Run bundle**: one JSON file per run with header, frames, applied hauntings, verdicts, score and optional shrink result.
- **Séance Room**: the static web UI that reads bundles.
- **Live view**: the Séance Room fed by a server-sent event stream while a run is in progress.

## Requirements

### Requirement 1: Run bundles

**User Story:** As a user, I want each run exported as one self-contained file, so that it can be viewed, shared and hosted.

#### Acceptance Criteria

1. WHEN `poltergeist export <runId>` or `poltergeist export --all --out <dir>` is run, THE Exporter SHALL write one JSON bundle per run and an `index.json` listing them.
2. THE Exporter SHALL include header, frames, applied hauntings, verdicts with evidence, score and family pass rates, and the shrink result when there is one.
3. THE Exporter SHALL apply the recorder's redaction again before writing, so a bundle never contains a redacted secret.

### Requirement 2: Séance Room

**User Story:** As a user, I want to browse runs visually, so that I can understand a failure in seconds.

#### Acceptance Criteria

1. THE Séance Room SHALL show a runs list with scenario, agent, seed, trial, status, score and date, sortable by score and date.
2. WHEN a run is opened, THE Séance Room SHALL show a timeline of frames in `seq` order, with direction, method, tool, occurrence and a badge for each haunting that fired.
3. WHEN a haunted frame is expanded, THE Séance Room SHALL show the original and the delivered message side by side with the differences highlighted.
4. THE Séance Room SHALL show the verdict panel (each oracle, pass or fail, evidence linked to its frames) and the score breakdown by family.
5. WHEN a run has a shrink result, THE Séance Room SHALL show the original plan and the minimal plan side by side, with the confirmed failure rate.
6. THE Séance Room SHALL show the haunting catalogue with each haunting's family and a plain-language description.
7. THE Séance Room SHALL show a plain-language label next to every themed label.

### Requirement 3: Live view

**User Story:** As a presenter, I want to watch a run happen, so that the demo shows hauntings landing in real time.

#### Acceptance Criteria

1. WHEN `poltergeist ui --live` is run, THE UI Server SHALL serve the Séance Room and a server-sent event stream of frames, applied hauntings and verdicts for runs in progress.
2. THE UI Server SHALL bind to 127.0.0.1 by default.

### Requirement 4: Accessibility and performance

**User Story:** As any user, I want the UI to be usable and fast.

#### Acceptance Criteria

1. THE Séance Room SHALL meet WCAG 2.1 AA contrast, work fully with the keyboard and respect `prefers-reduced-motion`.
2. THE Séance Room SHALL render a run with 5,000 frames with a virtualised list and no visible lag when scrolling.

### Requirement 5: MCP server

**User Story:** As a Kiro user, I want to run and inspect hauntings from my IDE's agent, so that Poltergeist is part of my development loop.

#### Acceptance Criteria

1. WHEN `poltergeist mcp` is run, THE MCP Server SHALL expose over stdio the tools `haunt_catalog`, `haunt_run`, `haunt_report`, `haunt_replay` and `haunt_shrink`.
2. WHEN `haunt_run` is called, THE MCP Server SHALL start the run in the background and return its run id at once; `haunt_report` SHALL return status, score and failing verdicts.
3. IF a tool receives a scenario path outside the repository's `scenarios/` directory, THEN THE MCP Server SHALL refuse it with a tool error.

### Requirement 6: GitHub Action

**User Story:** As a team, I want Poltergeist in CI, so that a pull request that makes our agent less safe fails.

#### Acceptance Criteria

1. THE Action SHALL take the inputs `suite`, `agent`, `min-score`, `max-drop` and `baseline`, and output `score`.
2. THE Action SHALL upload the run bundles and JUnit XML as workflow artifacts and write a summary table to the job summary.
3. THE Action SHALL fail WHEN the suite score is below `min-score` or has dropped by more than `max-drop` points against the baseline.

### Requirement 7: Hosted demo

**User Story:** As a judge, I want to open a link and explore real runs, so that I can evaluate the project without setup or an API key.

#### Acceptance Criteria

1. WHEN `pnpm demo:build` is run, THE Build SHALL produce a static site containing the Séance Room and the recorded demo bundles.
2. THE static site SHALL work on any static host with no server and no API key.
