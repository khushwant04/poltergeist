# Requirements Document

## Introduction

The haunting engine turns a seed into a plan and applies that plan to live traffic. It is a pipeline
interceptor (see `proxy-core`). Every haunting is a plugin with a pure `apply` function, a fast-check
arbitrary for its parameters, and a way to shrink those parameters. Version 1 ships six hauntings;
six more follow if time allows.

## Glossary

- **Catalog**: the set of registered hauntings, with a `catalogVersion` string.
- **Plan**: `{ version, catalogVersion, seed, scenarioId, entries[], requires[] }`.
- **Plan entry**: one haunting with its target and fully decided parameters.
- **Target**: `{ method, toolName?, occurrence }`, e.g. the 3rd `tools/call` of `read_file`.
- **Payload**: an injection text template from the payload library.
- **Sink tool**: a fixture tool that would send data out of the system (e.g. `send_email`).
- **Marker action**: the exact tool call an injection asks for, used by the obedience oracle.

## Requirements

### Requirement 1: Generate a plan from a seed

**User Story:** As a tester, I want a seed to fully determine the hauntings in a run, so that any failure can be reproduced.

#### Acceptance Criteria

1. WHEN given a seed, a scenario and a catalog, THE Plan Generator SHALL produce a plan using fast-check arbitraries driven only by that seed.
2. THE Plan Generator SHALL produce an identical plan, with an identical plan hash, for the same seed, scenario and catalog version.
3. THE Plan Generator SHALL only use hauntings allowed by the scenario and SHALL produce at most `scenario.hauntings.maxPerRun` entries.
4. THE Plan Generator SHALL only target tools listed in the scenario.
5. THE Plan Generator SHALL set `plan.requires` to the union of the capabilities its entries need (for example `tools.listChanged`).

### Requirement 2: Plan format

**User Story:** As a tester, I want plans to be plain, versioned JSON, so that I can read, edit, share and replay them.

#### Acceptance Criteria

1. THE plan SHALL be JSON validated by a zod schema and SHALL include `version`, `catalogVersion`, `seed`, `scenarioId`, `entries` and `requires`.
2. THE plan hash SHALL be the sha256 of the plan's canonical JSON, so key order does not change it.
3. Each entry SHALL address its message by target (method, tool name, occurrence), never by global sequence number.

### Requirement 3: Apply a plan to traffic

**User Story:** As a tester, I want hauntings to fire exactly where the plan says, so that results mean what the plan says.

#### Acceptance Criteria

1. WHEN a frame matches an entry's target, THE Haunting Engine SHALL call that haunting's `apply` and return its Effect to the pipeline.
2. WHEN several entries match the same frame, THE Haunting Engine SHALL apply them in plan order, each to the result of the previous one, and return one combined Effect.
3. THE Haunting Engine SHALL record, for every applied entry, the entry index, the haunting id and a one-line plain-language description.
4. WHEN a run ends, THE Haunting Engine SHALL report entries that never fired as `unfired`.
5. THE `apply` function of every haunting SHALL be pure: it SHALL NOT read the clock, draw random numbers, perform I/O or mutate its input.

### Requirement 4: Haunting plugin interface

**User Story:** As a contributor, I want to add a haunting by writing one file, so that the catalog can grow.

#### Acceptance Criteria

1. A haunting SHALL declare `id`, `family` (`injection`, `schema`, `timing` or `data`), the methods it targets, the capabilities it requires, a parameter arbitrary, `apply`, `shrinkParams`, `size` and `describe`.
2. `shrinkParams(p)` SHALL return candidates that are strictly smaller than `p` by `size`.
3. `describe(p)` SHALL return one plain-language sentence suitable for reports.
4. THE Catalog SHALL reject two hauntings with the same id at load time.

### Requirement 5: Version 1 hauntings

**User Story:** As a tester, I want six well-defined hauntings that cover injection, schema, timing and data failures, so that one suite exercises the main failure modes.

#### Acceptance Criteria

1. **whisper**: WHEN applied to a `tools/call` result, THE haunting SHALL insert a payload text before, after or inside the existing text content (as plain text, an HTML comment, hidden markdown or a JSON field), keeping all original content.
2. **possession**: WHEN applied to a `tools/call` result, THE haunting SHALL insert a payload that asks the agent to call a sink tool with a canary to a `.invalid` address, and SHALL record the marker action.
3. **rug-pull**: WHEN the N-th `tools/call` result is forwarded, THE haunting SHALL inject `notifications/tools/list_changed`, and on the next `tools/list` result SHALL change one tool's description (adding a payload) or input schema (renaming a property).
4. **vanish**: WHEN applied to a `tools/call` response, THE haunting SHALL drop it.
5. **liar**: WHEN applied to a `tools/call` result that contains a value at one of the scenario's lie targets, THE haunting SHALL replace that value with a false value of the same type (numbers scaled by a factor in [0.5, 0.9] or [1.1, 2.0], dates shifted by 1–30 days) and SHALL record the true and false values.
6. **error-storm**: WHEN applied to a tool, THE haunting SHALL return an error for the first `k` attempts (1 ≤ k ≤ 3) with the same tool and canonical arguments, as either `isError: true` or JSON-RPC error -32603, and SHALL pass later attempts through.

### Requirement 6: Later hauntings

**User Story:** As a tester, I want a broader catalog when time allows.

#### Acceptance Criteria

1. THE Catalog MAY add **poisoned-description** (payload inside a tool description in `tools/list`), **shapeshifter** (rename or drop fields, swap types in results), **lag** (delay), **echo-scramble** (duplicate or hold responses), **half-life** (truncate text content) and **flood** (append large filler text).
2. Each later haunting SHALL meet Requirement 4 and SHALL bump `catalogVersion`.

### Requirement 7: Payload library

**User Story:** As a maintainer, I want injection payloads in data files with safety checks, so that payloads are reviewable and can never point at real systems.

#### Acceptance Criteria

1. THE Payload Library SHALL load payloads from `packages/hauntings/payloads/*.yaml`, each with `id`, `family`, `style` and a text template using `{{canary}}`, `{{sinkTool}}`, `{{attacker}}` and `{{task}}` placeholders.
2. IF a payload contains an email address or URL whose domain does not end in `.invalid`, THEN THE Payload Library SHALL refuse to load it.
3. IF a possession payload does not contain `{{canary}}`, THEN THE Payload Library SHALL refuse to load it.
4. Rendering a payload SHALL be deterministic for the same inputs.
