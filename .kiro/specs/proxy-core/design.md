# Design Document: proxy-core

## Overview

The proxy forwards JSON-RPC messages between two MCP SDK transports and runs every message through a
pipeline of interceptors. Interceptors are pure decision makers: they return an `Effect`. The
`EffectExecutor` is the only part that touches time. The `Recorder` writes what was actually delivered.

## Architecture

```
agent ⇄ AgentSideTransport ─► Pipeline ─► EffectExecutor ─► UpstreamTransport ⇄ MCP server
                               │   ▲            │
                               │   └ Correlator, OccurrenceCounter
                               ▼                ▼
                        Interceptors[]       Recorder (JSONL)
```

- **Transports** are SDK `Transport` implementations: `StdioServerTransport` (agent side, stdio),
  `StdioClientTransport` (upstream, spawns the child), and the Streamable HTTP pair for `--upstream`.
- The proxy never uses SDK `Client`/`Server` classes, so it forwards any message the protocol allows,
  including ones the SDK version doesn't know yet.

## Components and Interfaces

```ts
// packages/core
type Direction = "c2s" | "s2c";

interface Frame {
  seq: number;                 // strictly increasing per run
  dir: Direction;
  t: number;                   // ms since run start (Clock)
  msg: JSONRPCMessage;
  request?: RequestContext;    // for s2c responses: the correlated request
  occurrence?: number;         // for c2s requests and their s2c responses
}

interface RequestContext {
  id: string | number;
  method: string;              // e.g. "tools/call", "tools/list", "initialize"
  toolName?: string;           // for tools/call
  args?: unknown;              // for tools/call
  occurrence: number;
}

type Effect =
  | { kind: "forward" }
  | { kind: "replace"; msg: JSONRPCMessage; cause: HauntingRef }
  | { kind: "delay"; ms: number; cause: HauntingRef }
  | { kind: "drop"; cause: HauntingRef }
  | { kind: "duplicate"; copies: number; gapMs: number; cause: HauntingRef }
  | { kind: "hold"; cause: HauntingRef }
  | { kind: "inject"; msg: JSONRPCMessage; then: Effect; cause: HauntingRef };

interface HauntingRef { entryIndex: number; haunting: string; }

interface Interceptor {
  name: string;
  onFrame(frame: Readonly<Frame>, ctx: PipelineContext): Effect;   // must be synchronous and pure
}
```

- **Pipeline**: assigns `seq`, asks the `Correlator` for request context, asks the `OccurrenceCounter` for
  the occurrence, then folds interceptors: the first non-`forward` effect wins for that frame; later
  interceptors see the frame with `replace` already applied. An interceptor exception yields `forward`
  plus an `interceptor_error` event (Req 3.5).
- **Correlator**: a map from (request id) to `RequestContext`, filled on c2s requests and removed on the
  matching s2c response. Ids are unique per session, so a plain map is enough; duplicate responses after
  removal are tagged `request: undefined, orphan: true`.
- **OccurrenceCounter**: `Map<string, number>` keyed by `method + "\u0000" + (toolName ?? "")`.
- **EffectExecutor**: performs effects with real timers. Delays and holds are per-message and never block
  the queue. It keeps a `droppedIds` set for Req 6.2.
- **Recorder**: an append-only writer with `fs.writeSync` per line. It applies redaction just before writing.
- **Initialize rewriter**: an interceptor registered first. It sets `capabilities.tools.listChanged`
  only when `plan.requires` contains `"tools.listChanged"` (Req 5).

## Data Models

Trace lines (zod-validated, discriminated on `type`):

```ts
type TraceLine =
  | { type: "header"; runId: string; versions: { poltergeist: string; catalog: string; fastCheck: string };
      seed: number | null; planHash: string | null; scenarioId: string | null; startedAt: string }
  | { type: "frame"; seq: number; dir: Direction; t: number; msg: JSONRPCMessage;
      original?: JSONRPCMessage; cause?: HauntingRef; injected?: boolean; occurrence?: number;
      method?: string; toolName?: string }
  | { type: "event"; t: number; name: "interceptor_error" | "child_exit" | "late_response_discarded" | "hold_timeout";
      detail: Record<string, unknown> }
  | { type: "llm"; i: number; requestHash: string; response: unknown };   // written by the reference agent (replay spec)
```

## Correctness Properties

### Property 1: Pass-through is invisible
For any sequence of valid JSON-RPC messages in both directions, with an empty plan, the delivered
sequence in each direction equals the input sequence under canonical JSON.
**Validates: Requirements 1.2, 3.6**

### Property 2: Sequence numbers
For any run, frame `seq` values are unique and strictly increasing in recording order.
**Validates: Requirements 3.2**

### Property 3: Occurrence counting
For any interleaving of requests, the occurrence of a request equals 1 + the number of earlier requests
with the same (method, tool name), and every response carries its request's occurrence.
**Validates: Requirements 3.4**

### Property 4: Correlation
For any set of requests whose responses arrive in any order, each response is correlated with the request
that has the same id, and a second response for the same id is marked orphan.
**Validates: Requirements 3.3**

### Property 5: Trace round trip
For any run, parsing the trace yields frames whose delivered messages equal the forwarded messages, in order.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 6: Redaction
For any secret value matching a redact pattern and any message that contains it, the written trace line
does not contain the secret; for any canary, the written line still contains it.
**Validates: Requirements 4.4**

### Property 7: Interceptor failure isolation
For any message and any interceptor that throws, the message is forwarded unchanged and an
`interceptor_error` event is recorded.
**Validates: Requirements 3.5**

### Property 8: stdout purity
For any run that also emits log output, every line written to stdout parses as a JSON-RPC message.
**Validates: Requirements 1.3**

## Error Handling

- Child fails to spawn → exit 2 with the command and OS error.
- Malformed JSON from either side → recorded as an event and forwarded byte-for-byte (the agent's or server's
  own error handling is part of what is being tested).
- Recorder write failure → log to stderr and keep proxying; a run must not die because a disk is full.

## Testing Strategy

- Property tests 1–8 run against in-memory transport pairs (`core/testing/memory-transport.ts`) and the fake `Clock`.
- An end-to-end test spawns the real fixture server through `poltergeist wrap` and runs a scripted MCP client.
- A stdio test runs the proxy with logging at debug level and checks Property 8 on real process output.
