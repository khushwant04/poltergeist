# Implementation Plan

- [ ] 1. Define the haunting plugin interface, plan schema and catalog
  - `Haunting<P>`, `ApplyInput`, `ApplyResult`, `EngineState`, `PlanEntry`, `Plan` types and zod schemas
  - Catalog loader that sorts by id, rejects duplicate ids and exposes `catalogVersion`
  - _Requirements: 2.1, 4.1, 4.4_

- [ ] 2. Build the payload library
- [ ] 2.1 Implement the YAML loader, `{{placeholder}}` renderer and safety checks (`.invalid` domains, canary required for possession)
  - Write the first payloads: 6 whisper and 6 possession payloads with `short` variants
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
- [ ]* 2.2 Write unit tests that a payload with a real domain or a possession payload without a canary is refused
  - _Requirements: 7.2, 7.3_

- [ ] 3. Build the plan generator
- [ ] 3.1 Implement `planArb`, `generatePlan(seed, scenario, catalog)` and `planHash`
  - Sorted catalog and tool lists, sorted entries, `requires` as the union of entry requirements
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3_
- [ ]* 3.2 Write property test for seed determinism
  - **Property 1: Seed determinism**
  - **Validates: Requirements 1.1, 1.2**
- [ ]* 3.3 Write property test for plan validity
  - **Property 2: Plan validity**
  - **Validates: Requirements 1.3, 1.4, 2.1**
- [ ]* 3.4 Write property test for hash stability
  - **Property 3: Hash stability**
  - **Validates: Requirements 2.2**
- [ ] 3.5 Add the golden plan test (seed 42 on the demo scenario) tied to `catalogVersion`
  - _Requirements: 1.2_

- [ ] 4. Build the haunting engine interceptor
- [ ] 4.1 Implement target matching, plan-order composition, `EngineState`, fired/unfired tracking and applied-haunting events
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
- [ ]* 4.2 Write property test for plan order composition
  - **Property 10: Plan order composition**
  - **Validates: Requirements 3.2**

- [ ] 5. Implement the six version 1 hauntings
- [ ] 5.1 whisper
  - _Requirements: 5.1_
- [ ]* 5.2 Write property test: whisper keeps the original content
  - **Property 5: Whisper keeps the original content**
  - **Validates: Requirements 5.1**
- [ ] 5.3 possession, recording the marker action
  - _Requirements: 5.2_
- [ ]* 5.4 Write property test: possession targets canaries and `.invalid` only
  - **Property 6: Possession targets canaries and `.invalid` only**
  - **Validates: Requirements 5.2, 7.2, 7.3**
- [ ] 5.5 rug-pull, using an `inject` effect for `notifications/tools/list_changed` and requiring `tools.listChanged`
  - _Requirements: 5.3, 1.5_
- [ ] 5.6 vanish
  - _Requirements: 5.4_
- [ ] 5.7 liar, using the scenario's lie targets and recording true and false values
  - _Requirements: 5.5_
- [ ]* 5.8 Write property test: liar changes the value but not its type
  - **Property 8: Liar changes the value but not its type**
  - **Validates: Requirements 5.5**
- [ ] 5.9 error-storm with attempt tracking by tool and canonical arguments
  - _Requirements: 5.6_
- [ ]* 5.10 Write property test for the error-storm sequence
  - **Property 7: Error-storm sequence**
  - **Validates: Requirements 5.6**

- [ ] 6. Cross-cutting haunting properties
- [ ]* 6.1 Write property test: apply is pure and deterministic, for every haunting in the catalog
  - **Property 4: Apply is pure and deterministic**
  - **Validates: Requirements 3.5, 4.1**
- [ ]* 6.2 Write property test: shrinking makes params smaller, for every haunting in the catalog
  - **Property 9: Shrinking makes params smaller**
  - **Validates: Requirements 4.2**

- [ ] 7. Checkpoint: wrap the fixture server with `--seed 42 --scenario scenarios/demo.yaml` and see each version 1 haunting fire in the trace

- [ ]* 8. Later hauntings, if time allows: poisoned-description, shapeshifter, lag, echo-scramble, half-life, flood
  - Each one meets the plugin interface and bumps `catalogVersion`
  - _Requirements: 6.1, 6.2_
