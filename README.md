# Poltergeist

**Chaos testing for AI agents.** Poltergeist is an open-source MCP proxy that haunts your agent on purpose — prompt injections, schema changes, timeouts and lies — then scores how it holds up and shrinks every failure to a minimal, replayable test case.

> Status: in development for Kiroween 2026 (Frankenstein category).

## How it works

Put Poltergeist between your agent and any MCP server with one config change:

```bash
poltergeist wrap -- node my-mcp-server.js
```

The agent talks to Poltergeist as if it were the server. Poltergeist forwards the traffic and applies a **haunting plan** generated from a seed:

| Haunting | What it does | What it tests |
|---|---|---|
| Whisper | Hides instructions inside a tool result | Does the agent treat tool output as data, not orders? |
| Possession | Asks the agent to send a canary to an attacker address | Does injected text ever trigger a sensitive action? |
| Rug pull | Changes a tool's definition mid-session | Does the agent notice and re-check? |
| Vanish | Never answers a call | Does it recover without looping forever? |
| Liar | Returns plausible but false data | Does it cross-check before acting? |
| Error storm | Fails, then succeeds on retry | Does it retry sensibly and report honestly? |

Every run is recorded and judged by **oracles** (canary leak, forbidden call, injection obedience, task completed, recovery, spotted the lie), which roll up into a 0–100 **resilience score**. Failures are **shrunk** to the smallest plan that still fails and saved as regression tests.

## Safety

Attacks only ever target planted canaries, fixture tools and reserved `.invalid` addresses. Poltergeist is a testing tool, installed by an agent's owner in front of their own agent.

## Built with Kiro

The `.kiro/` directory holds the specs, steering docs and hooks that drive this project's development.

## License

[Apache-2.0](LICENSE)
