# Design Document: replay-and-shrink

## Overview

Replay has two modes. Environment replay is simply "run again with the same seed and plan". Full replay
swaps in two stubs: an LLM stub that serves the cassette, and a server stub that serves recorded responses,
so only Poltergeist's own code runs for real. The shrinker is a budgeted delta-debugging loop over plan
entries and then over parameters, with majority voting for flaky agents.

## Architecture

```
Full replay:
  reference agent loop ─► LlmStub (cassette) 
          │
          ▼
  proxy + haunting engine (real) ─► ServerStub (recorded s2c responses, keyed by request)

Shrink:
  failing run ─► repro check (k trials) ─► ddmin(entries) ─► shrinkParams per entry ─► confirm (5 trials)
                         │                          │
                         └──── TrialRunner (runner spec) ◄──┘   budget counter, progress events
```

## Components and Interfaces

```ts
interface TrialRunner {                                   // implemented by the runner; faked in tests
  runTrial(input: { scenarioId: string; seed: number; plan: Plan }): Promise<{ failed: Set<OracleId>; runId: string }>;
}

interface ShrinkOptions { target: OracleId; trials: number; budget: number; confirmTrials: number; }

interface ShrinkResult {
  status: "minimal" | "partial" | "flaky";
  original: Plan; minimal: Plan;
  trialsUsed: number; failureRate: number;                // from the confirm step
  steps: ShrinkStep[];
}
```

### LlmStub
Maps the i-th LLM call to cassette entry i. Before answering, it computes the request hash; a mismatch
raises `DivergenceError({ step: i, kind: "llm", expectedHash, actualHash })`.

### ServerStub
An in-memory MCP server transport. It indexes recorded s2c responses by
`(method, toolName, occurrence, sha256(canonical args))` from the **original** messages in the trace
(before hauntings), so the real haunting engine re-applies hauntings during replay. A request with no
recorded response raises `DivergenceError({ kind: "tool", ... })`.

### Shrinker
1. **Repro check:** run k trials of the original plan. Fewer than ⌈k/2⌉ failures → status `flaky`.
2. **ddmin over entries:** classic delta debugging (split into n chunks, try complements and subsets,
   increase granularity). A candidate is accepted when `isFailing(candidate)` by majority vote.
3. **Parameter shrinking:** for each entry in order, try `shrinkParams` candidates in order and accept the
   first that still fails; repeat until none is accepted.
4. **Confirm:** run `confirmTrials` (5) trials of the final plan and report the failure rate.
5. **Budget:** every trial decrements the budget. The confirm step has its own reserved trials,
   so `budget` covers steps 1–3 and the total is `budget + confirmTrials`.
Plans produced by shrinking keep the original `seed` and `catalogVersion` and get a new hash.

Why our own shrinker rather than fast-check's: every step costs real agent runs, so it must respect an explicit
budget, vote across trials and report progress. fast-check is still used to generate plans and to test the shrinker.

## Implementation notes (as built)

- **Package split.** `@poltergeist/replay` holds the pure parts (LLM stub, server stub, frame comparison,
  shrinker, regression files). The runner owns orchestration (`replayRun`, `shrinkRun`, `runRegressions`)
  because it already knows how to run a scenario, so replay never depends on the runner.
- **Cassette hash ignores the model id** (`llmRequestHash`: system, tools, messages, max_tokens), so a replay
  does not need the original model configured.
- **Divergence = first frame that differs.** After a full replay the new trace is compared with the recording
  frame by frame (direction, message, delivery, cause), not timing. LLM hash mismatches are reported first.
- **Agents are rebuilt from the recorded name** (`fake(falls-for:possession)`, `reference(hardened)`).
- **Shrinker extras:** it tries the empty plan first (a failure with no hauntings is the agent's own bug), stops
  a candidate's trials early once the majority is decided, and reports `partial` when the budget runs out.
- **CLI:** `poltergeist replay <runId> [--mode env|full]`, `poltergeist shrink <runId> --target <oracle>`,
  `poltergeist run --suite regressions` (exit 1 while any case still fails).

## Data Models
Regression file:
```json
{ "scenarioId": "inbox-summary", "seed": 1337, "target": "canary-leak",
  "plan": { "...": "minimal plan" }, "failureRate": 0.8, "createdAt": "..." }
```

## Correctness Properties

### Property 1: Full replay equivalence
For any run recorded with the deterministic fake agent, full replay produces the same canonical message sequence.
**Validates: Requirements 3.1, 3.2**

### Property 2: Divergence detection
For any recorded run and any single change to one recorded agent request (a tool call) or one cassette response, full replay reports a divergence at the first step affected.
(Server responses are served from the recording itself, so changing one alone changes nothing the agent does; it is only a divergence when it no longer matches what the haunting engine produces from the original.)
**Validates: Requirements 3.3**

### Property 3: Shrinking keeps a subset
For any plan and failure predicate, every entry of the minimal plan comes from the original plan (same haunting and target).
**Validates: Requirements 4.2**

### Property 4: Shrinking never grows
For any plan and failure predicate, the minimal plan has no more entries than the original, and each kept entry's `size` is at most its original size.
**Validates: Requirements 4.2**

### Property 5: 1-minimality for deterministic failures
For any plan and any deterministic failure predicate over entries, when the budget is not exhausted, removing any single entry from the minimal plan makes it pass.
**Validates: Requirements 4.2**

### Property 6: Budget is respected
For any plan, predicate and budget n, the shrinker runs at most n trials before the confirm step and exactly `confirmTrials` in it.
**Validates: Requirements 4.3, 4.4**

### Property 7: Majority vote
For any seeded flaky predicate and k, a candidate is accepted if and only if at least ⌈k/2⌉ of its k trials failed.
**Validates: Requirements 4.1**

### Property 8: Regression round trip
For any shrink result, saving and loading the regression file gives the same scenario id, seed, plan and target.
**Validates: Requirements 5.1**

## Error Handling
- Divergence → exit 1 with the step, the expected and actual values, and a hint (usually: the agent code changed since recording).
- Version mismatch without `--force` → exit 2 with both versions.
- Budget exhausted → `partial` result, saved with a `partial: true` flag.

## Testing Strategy
- Properties 3–7 use a `FakeTrialRunner` whose failure is a seeded function of the plan's entries (deterministic or flaky).
- Properties 1–2 record runs with the fake agent and replay them.
- One end-to-end test: a fake agent that falls only for `possession` with payload `urgent-admin-note`; a 6-entry plan must shrink to that single entry.
