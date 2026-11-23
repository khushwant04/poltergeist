# Requirements Document

## Introduction

The proxy is the base of Poltergeist. It sits between an MCP client (the agent) and an MCP server,
forwards every JSON-RPC message in both directions, lets interceptors change, delay, drop, duplicate,
hold or inject messages, and records everything to a trace. With no plan, it must be invisible.

## Glossary

- **Proxy**: the `poltergeist wrap` process.
- **Agent side**: the transport facing the MCP client. **Upstream**: the transport facing the MCP server.
- **Frame**: one message as it passes through the proxy, with `seq`, direction and logical time.
- **Interceptor**: a component that sees each frame and returns an Effect.
- **Effect**: what to do with a frame: forward, replace, delay, drop, duplicate, hold, or inject a new message.
- **Occurrence**: the 1-based count of requests with the same (method, tool name) so far in the run.

## Requirements

### Requirement 1: Wrap a stdio MCP server

**User Story:** As an agent developer, I want to put Poltergeist in front of any stdio MCP server with one
config change, so that I can test my agent without changing its code.

#### Acceptance Criteria

1. WHEN `poltergeist wrap -- <command> [args...]` is run, THE Proxy SHALL spawn `<command>` as a child process, connect to it over stdio, and expose an MCP stdio endpoint on its own stdin and stdout.
2. WHEN no plan and no seed are given, THE Proxy SHALL forward every message unchanged, so the delivered message sequence equals the input sequence under canonical JSON.
3. THE Proxy SHALL write only MCP JSON-RPC messages to stdout and SHALL write all logs to stderr.
4. WHEN the child process exits, THE Proxy SHALL close the agent-side transport and exit with the child's exit code.
5. WHEN the agent-side transport closes, THE Proxy SHALL send SIGTERM to the child and SIGKILL after 5 seconds if it has not exited.
6. THE Proxy SHALL pass its environment to the child unchanged and SHALL NOT record environment values.

### Requirement 2: Proxy a Streamable HTTP server

**User Story:** As an agent developer, I want to wrap remote MCP servers too, so that HTTP-based tools can be tested the same way.

#### Acceptance Criteria

1. WHEN `--upstream <url>` and `--listen <port>` are given, THE Proxy SHALL connect to the upstream as a Streamable HTTP client and serve a Streamable HTTP endpoint on the given port.
2. THE Proxy SHALL map each agent session to exactly one upstream session.
3. THE Proxy SHALL bind to 127.0.0.1 unless `--host` is given explicitly.

### Requirement 3: Message pipeline

**User Story:** As a haunting author, I want every message to pass through an ordered chain of interceptors with its request context, so that hauntings can target specific tool calls.

#### Acceptance Criteria

1. THE Pipeline SHALL pass every message in both directions through the interceptor chain, in registration order, before forwarding it.
2. THE Pipeline SHALL assign each frame a run-unique, strictly increasing `seq` and a direction (`c2s` or `s2c`).
3. WHEN a server response arrives, THE Pipeline SHALL correlate it with the originating request by JSON-RPC id and give interceptors the request's method, tool name and arguments.
4. THE Pipeline SHALL count requests per (method, tool name) in arrival order, starting at 1, and give each frame its occurrence number.
5. IF an interceptor throws, THEN THE Pipeline SHALL forward the original message unchanged, record an `interceptor_error` event and continue.
6. THE Pipeline SHALL preserve message order within each direction unless an Effect explicitly delays, holds or drops a message.

### Requirement 4: Record a trace

**User Story:** As an agent developer, I want a complete record of every run, so that failures can be judged, replayed and shared.

#### Acceptance Criteria

1. THE Recorder SHALL write a JSONL trace to `--record <dir>` (default `.poltergeist/runs/<runId>.jsonl`): one header line, then one line per forwarded frame and one per event.
2. WHEN an Effect changes a message, THE Recorder SHALL record both the original and the delivered message and the haunting that caused it.
3. THE Recorder SHALL flush each line as it is written, so a crash keeps every line written so far.
4. THE Recorder SHALL replace values matching `--redact` patterns with `[redacted]` and SHALL NOT redact canaries.
5. THE trace header SHALL contain the run id (ULID), Poltergeist version, catalog version, fast-check version, seed, plan hash, scenario id (if any) and start time.

### Requirement 5: initialize handling

**User Story:** As a haunting author, I want the proxy to adjust advertised capabilities when a haunting needs them, so that schema-change hauntings reach the agent.

#### Acceptance Criteria

1. THE Proxy SHALL forward the `initialize` exchange unchanged by default.
2. WHEN the plan contains a haunting that requires `tools.listChanged`, THE Proxy SHALL set `capabilities.tools.listChanged` to `true` in the initialize result sent to the agent and record this as an effect.

### Requirement 6: Effects

**User Story:** As a haunting author, I want a fixed set of effects the proxy executes, so that hauntings stay pure and the proxy owns all timing.

#### Acceptance Criteria

1. WHEN an Effect is `delay(ms)`, THE Proxy SHALL forward the message after `ms` milliseconds, without blocking other messages.
2. WHEN an Effect is `drop`, THE Proxy SHALL not forward the message; IF the agent later sends `notifications/cancelled` for that request, THEN THE Proxy SHALL forward the cancellation upstream and discard any late response.
3. WHEN an Effect is `duplicate(copies, gapMs)`, THE Proxy SHALL forward the message `copies + 1` times, `gapMs` apart.
4. WHEN an Effect is `hold`, THE Proxy SHALL forward the message right after the next server-to-client response, or after 10 seconds if none arrives.
5. WHEN an Effect is `inject(message)`, THE Proxy SHALL send the new message to the agent immediately after the current frame and record it as an injected frame.
6. WHEN an Effect is `replace(message)`, THE Proxy SHALL forward the replacement instead of the original.

### Requirement 7: Plan loading

**User Story:** As a user, I want to pass a plan file or a seed, so that runs are reproducible.

#### Acceptance Criteria

1. WHEN `--plan <file>` is given, THE Proxy SHALL load and validate it against the plan schema.
2. WHEN `--seed <n>` and `--scenario <path>` are given, THE Proxy SHALL ask the haunting engine to generate the plan.
3. IF the plan or its flags are invalid, THEN THE Proxy SHALL exit with code 2 and a message that names the invalid field.
