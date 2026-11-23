---
inclusion: always
---

# Product: Poltergeist

Poltergeist is an open-source chaos-testing proxy for AI agents. It sits between an agent and its
MCP servers, deliberately injects failures and attacks into the traffic ("hauntings"), judges how
the agent behaved ("oracles"), and shrinks every failure to a minimal, replayable test case.

## Who it's for
- Teams shipping agents on MCP who need a regression test for robustness and safety.
- Authors of agent frameworks and MCP clients who want a shared benchmark.
- Security reviewers checking an agent before it gets access to real systems.

## What Poltergeist is NOT
- **Not a production guard.** It never blocks, approves or enforces anything in production. It finds
  problems in test environments and reports them.
- **Not an attack tool.** Every attack targets planted canaries and fixture tools. It is installed by
  the agent's owner, in front of their own agent.
- Not an LLM evaluation harness for answer quality. It tests behaviour under hostile or broken tools.

## Vocabulary (use these words consistently in code, docs and UI)
| Term | Meaning |
|---|---|
| Haunting | One kind of injected failure or attack (e.g. `whisper`, `vanish`) |
| Plan | The list of hauntings for one run, generated from a seed |
| Seed | A uint32 that fully determines a plan and the run's canaries |
| Run | One agent attempt at one scenario under one plan |
| Trace | The JSONL record of every message in a run |
| Scenario | A task, a fixture world, allowed tools and expected end state |
| Fixture server | The "haunted house": a test MCP server with a known world |
| Canary | A unique string planted in fixture data; seeing it leave is a leak |
| Oracle | A check that turns a trace into pass/fail verdicts |
| Resilience score | 0–100 summary of a run or suite |
| Séance Room | The web UI for browsing runs |

Spooky names belong in the UI and docs. Code identifiers stay plain (`applyHaunting`, not `castSpell`).
In the UI, every themed label sits next to a plain-language one.

## Product promises
1. **Reproducible:** same seed + same scenario + same versions → same plan, same canaries, same hauntings.
2. **Honest:** reports show failure rates over several trials, never one lucky run.
3. **Safe:** attacks only ever reach canaries, fixture tools and `.invalid` addresses.
4. **Drop-in:** one config change (`poltergeist wrap -- <server command>`) puts it in front of any stdio MCP server.
