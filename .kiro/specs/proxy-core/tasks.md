# Implementation Plan

- [x] 1. Set up the workspace and the `core` package
  - pnpm workspace, strict TypeScript, ESM, Vitest, fast-check (exact version), lint rules for banned APIs and stdout use
  - `core`: `Frame`, `Effect`, `RequestContext`, `HauntingRef`, `TraceLine` types and zod schemas
  - `core/canonical-json`, `core/hash` (sha256 of canonical JSON), `core/clock` (real and fake), `core/log` (stderr only)
  - `core/testing/memory-transport.ts`: an in-memory linked `Transport` pair
  - _Requirements: 1.3, 3.2_

- [x] 2. Build the pipeline
- [x] 2.1 Implement `OccurrenceCounter` and `Correlator`
  - _Requirements: 3.3, 3.4_
- [x]* 2.2 Write property test for occurrence counting
  - **Property 3: Occurrence counting**
  - **Validates: Requirements 3.4**
- [x]* 2.3 Write property test for correlation, including out-of-order and duplicate responses
  - **Property 4: Correlation**
  - **Validates: Requirements 3.3**
- [x] 2.4 Implement `Pipeline` with ordered interceptors, seq assignment and error isolation
  - _Requirements: 3.1, 3.2, 3.5, 3.6_
- [x]* 2.5 Write property tests for sequence numbers and interceptor failure isolation
  - **Property 2: Sequence numbers**
  - **Property 7: Interceptor failure isolation**
  - **Validates: Requirements 3.2, 3.5**

- [x] 3. Build the effect executor
- [x] 3.1 Implement forward, replace, delay, drop, duplicate, hold and inject with the injectable clock
  - Drop keeps `droppedIds`; cancellations go upstream; late responses are discarded with an event
  - Hold releases after the next s2c response or after 10 s
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
- [x] 3.2 Unit tests for each effect using the fake clock
  - _Requirements: 6.1–6.6_

- [x] 4. Build the recorder
- [x] 4.1 Implement the JSONL writer with per-line flush, header line and redaction
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
- [x]* 4.2 Write property test for trace round trip
  - **Property 5: Trace round trip**
  - **Validates: Requirements 4.1, 4.2, 4.3**
- [x]* 4.3 Write property test for redaction that never removes canaries
  - **Property 6: Redaction**
  - **Validates: Requirements 4.4**

- [x] 5. Wire up the stdio proxy
- [x] 5.1 Implement `poltergeist wrap -- <command>`: spawn the child, connect transports, exit-code and signal handling
  - _Requirements: 1.1, 1.4, 1.5, 1.6_
- [x] 5.2 Implement the initialize rewriter interceptor
  - _Requirements: 5.1, 5.2_
- [ ] 5.3 Implement plan loading (`--plan`, `--seed` + `--scenario`) with exit code 2 on invalid input
  - Done: `--plan` loading and validation, exit code 2 with the field name. Remaining: `--seed` + `--scenario` needs the haunting engine (exits 2 with "not available yet" until then)
  - _Requirements: 7.1, 7.2, 7.3_
- [x]* 5.4 Write property test for pass-through invisibility
  - **Property 1: Pass-through is invisible**
  - **Validates: Requirements 1.2, 3.6**
- [x]* 5.5 Write property test for stdout purity using a real child process with debug logging
  - **Property 8: stdout purity**
  - **Validates: Requirements 1.3**

- [x] 6. Add Streamable HTTP support
  - `--upstream <url> --listen <port> [--host]`, one upstream session per agent session, 127.0.0.1 by default
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 7. Checkpoint: all proxy-core tests pass; `poltergeist wrap` works in front of the fixture server from a real MCP client (Kiro or the MCP Inspector)
