---
inclusion: always
---

# Repository structure

```
packages/
  core/        shared types (Frame, Plan, Effect, Verdict), canonical JSON, hashing, seeded RNG, Clock, log
  proxy/       transports (stdio, Streamable HTTP), pipeline, correlator, occurrence counter, effect executor, recorder
  hauntings/   haunting plugins (one file each), payload library, plan generator, haunting engine (an interceptor)
  fixtures/    the haunted-house MCP server: files, mail, calendar, bank modules; world loading and canary planting
  oracles/     canary leak, forbidden call, injection obedience, task completed, recovered, spotted the lie; scoring
  runner/      scenarios, agent adapters (reference, external), run orchestration, SQLite store, JUnit output
  replay/      cassette, environment replay, full replay, shrinker, regression cases
  cli/         `poltergeist` binary: wrap, run, score, replay, shrink, export, ui, mcp
  ui/          Séance Room (React + Vite)
scenarios/     scenario YAML files, worlds/, suites/, regressions/
action/        GitHub Action (composite)
docs/          user docs, haunting catalogue
.kiro/         specs, steering, hooks (committed, never gitignored)
```

## Dependency rules (enforced by a lint rule)
- `core` depends on nothing inside the repo.
- `proxy`, `hauntings`, `oracles` depend only on `core`.
- `fixtures` depends on `core`.
- `replay` depends on `core`, `proxy`, `hauntings`, `oracles`.
- `runner` depends on `core`, `proxy`, `hauntings`, `fixtures`, `oracles`, `replay`.
- `cli` may depend on everything; nothing depends on `cli`.
- `ui` depends only on the bundle types exported from `core`.

## Where tests live
- Unit tests next to the code: `src/**/*.test.ts`.
- Property tests next to the code: `src/**/*.prop.test.ts` (run by `pnpm test:prop`).
- End-to-end tests: `packages/runner/e2e/` using a deterministic fake agent, so CI needs no API key.
