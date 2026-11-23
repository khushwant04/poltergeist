---
inclusion: always
---

# Tech stack and conventions

## Stack
- **Runtime:** Node.js 22 LTS, TypeScript (strict), ES modules only.
- **Workspace:** pnpm workspaces. Pin every dependency to an exact version (no `^` or `~`).
  `fast-check` in particular must be pinned exactly: plan generation from a seed depends on its version.
- **MCP:** `@modelcontextprotocol/sdk`. The proxy works at the **transport** level (`Transport`:
  `start`, `send`, `onmessage`, `onclose`, `onerror`) so messages are forwarded with full fidelity.
  Use `Client`/`Server` classes only in the fixture server, the reference agent and `poltergeist mcp`.
- **Validation:** zod for every external input: CLI flags, plan files, scenario YAML, trace lines, MCP tool inputs.
- **Fuzzing and property tests:** fast-check. **Tests:** Vitest.
- **Storage:** SQLite via better-sqlite3. Traces are JSONL files; the database stores runs, verdicts and scores.
- **CLI:** commander. **IDs:** ULID. **YAML:** `yaml` package.
- **Reference agent:** Anthropic SDK tool-use loop. The model id comes from `POLTERGEIST_MODEL`; never hard-code one.
- **UI:** React + Vite, static build.

## Commands
- `pnpm install`, `pnpm build`, `pnpm test`, `pnpm test:prop` (property tests only), `pnpm lint`
- `pnpm demo` runs the demo suite against the reference agent; `pnpm demo:build` builds the static Séance Room with recorded bundles.

## Rules that prevent the classic MCP bugs
- **stdout is the protocol channel.** In the proxy, the fixture server and `poltergeist mcp`, never
  write to stdout except MCP messages. All logs go to **stderr** through `core/log`. `console.log` is
  banned in those packages (lint rule).
- Never parse a JSON-RPC message twice in different ways: parse once at the transport edge into the
  SDK's `JSONRPCMessage` type, then pass objects around.
- Canonical JSON (`core/canonical-json`, sorted keys, no whitespace) is the only input to hashes.

## Code style
- No `any`. Prefer discriminated unions over flags.
- Pure functions for anything that decides (plan generation, haunting `apply`, oracles, scoring, shrink
  decisions). I/O lives at the edges: transports, recorder, runner, CLI.
- Errors are typed (`PoltergeistError` with a `code`), carry a plain-language `hint`, and CLI exit codes
  are documented: 0 ok, 1 test failure (score below threshold), 2 invalid input, 3 internal error.
- Each package exports a small public API from `src/index.ts`; no deep imports across packages.
