# Implementation Plan

- [x] 1. Build the haunted-house fixture server
- [x] 1.1 Implement world loading, safe path resolution and the outbox
  - _Requirements: 1.2, 1.3_
- [x]* 1.2 Write property test: the world stays inside its directory
  - **Property 9: The world stays inside its directory**
  - **Validates: Requirements 1.2, 1.3**
- [x] 1.3 Implement the `files`, `mail`, `calendar` and `bank` modules with text and structured content
  - _Requirements: 1.1, 1.4_

- [x] 2. Scenarios and canaries
- [x] 2.1 Implement the scenario and suite schemas and loader with precise error messages
  - _Requirements: 2.1, 2.2, 2.3_
- [x]* 2.2 Write property test for scenario round trip
  - **Property 8: Scenario round trip**
  - **Validates: Requirements 2.1**
- [x] 2.3 Implement `deriveCanaries` and world preparation (`{{canary:N}}` planting)
  - _Requirements: 3.1, 3.2, 3.3_
- [x]* 2.4 Write property test for canary derivation
  - **Property 1: Canary derivation**
  - **Validates: Requirements 3.1, 3.2**
- [x] 2.5 Write the demo scenarios and worlds: `inbox-summary`, `pay-the-invoice` (bank + liar), `plan-my-week` (calendar + rug-pull)
  - _Requirements: 2.1_

- [x] 3. Agents
- [x] 3.1 Implement the `AgentAdapter` interface and the deterministic `fake` agent
  - _Requirements: 4.1_
- [x] 3.2 Implement the reference agent with `default` and `hardened` prompts, LLM recording and the answer event
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 4. Run orchestration
- [x] 4.1 Implement `poltergeist run` for one scenario: world, plan, proxy + fixtures, agent, budgets, collection
  - _Requirements: 4.1, 4.2, 4.4_
- [x] 4.2 Implement suites
  - _Requirements: 4.3_
- [x] 4.3 Implement live mode world preparation in `wrap --scenario` and `poltergeist score <runId>`
  - _Requirements: 6.1, 6.2_

- [x] 5. Oracles
- [x] 5.1 Implement canary leak with raw, base64, hex and URL encodings
  - _Requirements: 7.1, 7.7_
- [x]* 5.2 Write property tests for leak detection and no false leaks
  - **Property 2: Leak detection finds every encoding**
  - **Property 3: No false leaks**
  - **Validates: Requirements 7.1**
- [x] 5.3 Implement forbidden call and injection obedience
  - _Requirements: 7.2, 7.3, 7.7_
- [x]* 5.4 Write property test for forbidden call
  - **Property 4: Forbidden call**
  - **Validates: Requirements 7.2**
- [x] 5.5 Implement task completed with the `file`, `outbox`, `calendar` and `bank` predicates
  - _Requirements: 7.4_
- [x] 5.6 Implement recovered
  - _Requirements: 7.5_
- [x] 5.7 Implement spotted the lie with a three-vote LLM judge and a fixed rubric
  - _Requirements: 7.6_

- [x] 6. Scoring and outputs
- [x] 6.1 Implement `score()` with renormalisation and the leak cap; implement the suite score
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
- [x]* 6.2 Write property tests for score bounds, cap, monotonicity and renormalisation
  - **Property 5: Score bounds and cap**
  - **Property 6: Score monotonicity**
  - **Property 7: Renormalisation**
  - **Validates: Requirements 8.1, 8.2, 8.3**
- [x] 6.3 Implement SQLite storage, the JSON summary, JUnit output and exit codes with baseline comparison
  - _Requirements: 9.1, 9.2, 9.3_
- [x]* 6.4 Write property test: JUnit matches verdicts
  - **Property 10: JUnit matches verdicts**
  - **Validates: Requirements 9.2**

- [x] 7. End-to-end tests with the fake agent: for each v1 haunting, one run where the agent falls for it and one where it doesn't
  - _Requirements: 4.1, 7.1–7.5, 8.1_

- [ ] 8. Checkpoint: `pnpm demo` runs the demo suite with the reference agent and prints a score per scenario
