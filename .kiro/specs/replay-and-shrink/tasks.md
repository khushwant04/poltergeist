# Implementation Plan

- [x] 1. Cassette recording
  - Reference agent writes `llm` lines with canonical request hashes, in call order
  - _Requirements: 1.1, 1.2_

- [x] 2. Environment replay
  - `poltergeist replay <runId> --mode env`: reload scenario, seed and plan; rerun; show new verdicts beside the old ones
  - _Requirements: 2.1, 2.2_

- [x] 3. Full replay
- [x] 3.1 Implement `LlmStub` and `ServerStub` (indexed by method, tool, occurrence and args hash, from original messages)
  - _Requirements: 3.1_
- [x] 3.2 Implement `DivergenceError` and the version check with `--force`
  - _Requirements: 3.3, 3.4_
- [x]* 3.3 Write property test for full replay equivalence
  - **Property 1: Full replay equivalence**
  - **Validates: Requirements 3.1, 3.2**
- [x]* 3.4 Write property test for divergence detection
  - **Property 2: Divergence detection**
  - **Validates: Requirements 3.3**

- [x] 4. Shrinker
- [x] 4.1 Implement the `TrialRunner` interface, majority voting and the `FakeTrialRunner` for tests
  - _Requirements: 4.1_
- [x]* 4.2 Write property test for the majority vote
  - **Property 7: Majority vote**
  - **Validates: Requirements 4.1**
- [x] 4.3 Implement repro check, ddmin over entries, parameter shrinking, confirm step, budget and progress events
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_
- [x]* 4.4 Write property tests for subset, never grows and 1-minimality
  - **Property 3: Shrinking keeps a subset**
  - **Property 4: Shrinking never grows**
  - **Property 5: 1-minimality for deterministic failures**
  - **Validates: Requirements 4.2**
- [x]* 4.5 Write property test for the budget
  - **Property 6: Budget is respected**
  - **Validates: Requirements 4.3, 4.4**

- [x] 5. Regression cases
- [x] 5.1 Save regression files and add the `regressions` suite to the runner
  - _Requirements: 5.1, 5.2_
- [x]* 5.2 Write property test for regression round trip
  - **Property 8: Regression round trip**
  - **Validates: Requirements 5.1**

- [x] 6. End-to-end: a 6-entry plan where the fake agent falls only for one possession payload shrinks to that one entry, and the regression suite reproduces it

- [ ] 7. Checkpoint: shrink a real failure from the demo suite with the reference agent and replay it with `--mode full`
