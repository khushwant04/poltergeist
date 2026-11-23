# Requirements Document

## Introduction

When a run fails, Poltergeist must reproduce it and reduce it to the smallest plan that still fails.
LLM agents vary between runs, so reproduction uses majority votes over several trials, and a cassette
of recorded LLM responses allows exact replay for debugging.

## Glossary

- **Cassette**: the `llm` lines in a trace: request hash and response for each LLM call of the reference agent.
- **Environment replay**: rerun the agent live against the same seed, world, canaries and plan.
- **Full replay**: rerun with LLM responses from the cassette and server responses from the trace, so the run is reproduced exactly.
- **Failure signature**: the set of oracle ids that failed in a run; a shrink keeps one target oracle failing.
- **Trial**: one run of a candidate plan during shrinking.

## Requirements

### Requirement 1: Cassette

**User Story:** As a developer, I want the agent's LLM calls recorded, so that a failure can be replayed exactly.

#### Acceptance Criteria

1. THE Reference Agent SHALL record each LLM call as `{ type: "llm", i, requestHash, response }`, where `requestHash` is the sha256 of the canonical request body.
2. THE Recorder SHALL write cassette lines into the run's trace in call order.

### Requirement 2: Environment replay

**User Story:** As a developer, I want to rerun a failed run under exactly the same conditions, so that I can see whether my fix works.

#### Acceptance Criteria

1. WHEN `poltergeist replay <runId> --mode env` is run, THE Replayer SHALL rerun the same scenario with the same seed, canaries and plan against a live agent.
2. THE Replayer SHALL report the new verdicts next to the original ones.

### Requirement 3: Full replay

**User Story:** As a developer, I want a byte-exact replay of a failure, so that I can debug it without spending tokens or getting a different result.

#### Acceptance Criteria

1. WHEN `poltergeist replay <runId> --mode full` is run, THE Replayer SHALL serve LLM responses from the cassette and server responses from the trace, and run the agent loop and the haunting engine for real.
2. THE Replayer SHALL produce the same message sequence as the original run under canonical JSON.
3. IF a request hash or a tool call does not match the trace, or any frame differs from the recording, THEN THE Replayer SHALL report a divergence naming the step and showing the expected and actual values.
4. IF the trace's Poltergeist, catalog or fast-check version differs from the installed one, THEN THE Replayer SHALL refuse to replay unless `--force` is given.

### Requirement 4: Shrinking

**User Story:** As a developer, I want a failing run reduced to the smallest plan that still fails, so that the bug report is one line.

#### Acceptance Criteria

1. WHEN `poltergeist shrink <runId> --target <oracle> [--trials k] [--budget n]` is run, THE Shrinker SHALL treat a candidate plan as failing WHEN at least ⌈k/2⌉ of k trials (default k = 3) fail the target oracle.
2. THE Shrinker SHALL first remove entries (delta debugging over the entry list), then shrink each remaining entry's parameters with `shrinkParams`, keeping every change only if the candidate still fails.
3. THE Shrinker SHALL never run more than `n` trials in total (default 40); WHEN the budget runs out, THE Shrinker SHALL return the best plan so far marked `partial`.
4. WHEN shrinking ends, THE Shrinker SHALL confirm the final plan with 5 trials and report its failure rate.
5. THE Shrinker SHALL emit progress events (candidate, trial results, accepted or rejected) for the UI and the CLI.
6. IF the original failure does not reproduce in the first k trials, THEN THE Shrinker SHALL stop and report the failure as flaky with its observed rate.

### Requirement 5: Regression cases

**User Story:** As a developer, I want shrunk failures saved as tests, so that the bug stays fixed.

#### Acceptance Criteria

1. WHEN shrinking finishes, THE Shrinker SHALL save `scenarios/regressions/<scenario>-<oracle>-<seed>.json` with the scenario id, seed, minimal plan, target oracle and failure rate.
2. WHEN `poltergeist run --suite regressions` is run, THE Runner SHALL run every saved regression case with its saved plan.
