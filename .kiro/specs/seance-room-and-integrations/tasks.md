# Implementation Plan

- [ ] 1. Run bundles
- [ ] 1.1 Define `RunBundle` in `core`, implement `poltergeist export` with `index.json` and re-redaction
  - _Requirements: 1.1, 1.2, 1.3_
- [ ]* 1.2 Write property tests for bundle round trip and no secrets
  - **Property 1: Bundle round trip**
  - **Property 2: Bundles contain no secrets**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [ ] 2. Séance Room view models (pure)
- [ ] 2.1 Implement `toTimelineRows`, `toVerdictPanel`, `toPlanDiff` and `messageDiff`
  - _Requirements: 2.2, 2.3, 2.4, 2.5_
- [ ]* 2.2 Write property tests for timeline order and message diff
  - **Property 3: Timeline order**
  - **Property 4: Message diff is faithful**
  - **Validates: Requirements 2.2, 2.3**

- [ ] 3. Séance Room screens
- [ ] 3.1 Runs list, run detail (virtualised timeline, expandable diffs, verdict panel, score breakdown)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.2_
- [ ] 3.2 Shrink view and haunting catalogue
  - _Requirements: 2.5, 2.6_
- [ ] 3.3 Visual design, plain labels beside themed ones, keyboard support, reduced motion, axe check
  - _Requirements: 2.7, 4.1_

- [ ] 4. Live view
  - `poltergeist ui --live`: static server, SSE `/events`, in-process event bus from the runner, 127.0.0.1 by default
  - _Requirements: 3.1, 3.2_

- [ ] 5. MCP server
- [ ] 5.1 Implement `haunt_catalog`, `haunt_run`, `haunt_report`, `haunt_replay` and `haunt_shrink` with background jobs
  - _Requirements: 5.1, 5.2_
- [ ] 5.2 Implement the `scenarios/` path guard
  - _Requirements: 5.3_
- [ ]* 5.3 Write property test for the MCP path guard
  - **Property 5: MCP path guard**
  - **Validates: Requirements 5.3**
- [ ] 5.4 Add Poltergeist to Kiro's MCP config (`.kiro/settings/mcp.json`) and run a haunting from Kiro's chat

- [ ] 6. GitHub Action
- [ ] 6.1 Implement the composite action with artifacts and job summary
  - _Requirements: 6.1, 6.2_
- [ ]* 6.2 Write property test for the action gate
  - **Property 6: Action gate**
  - **Validates: Requirements 6.3**
- [ ] 6.3 Add a workflow in this repo that runs the `ci` suite with the fake agent on every pull request

- [ ] 7. Hosted demo
  - Record demo bundles with the reference agent, implement `pnpm demo:build`, deploy to a static host, Playwright smoke test
  - _Requirements: 7.1, 7.2_

- [ ] 8. Checkpoint: the hosted demo opens with recorded runs, and Kiro can start a run and read its report through `poltergeist mcp`
