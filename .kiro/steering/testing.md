---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.prop.test.ts", "packages/runner/e2e/**"]
---

# Testing conventions

## Property-based tests
- Each correctness property in a spec's `design.md` gets exactly one property test, named after it:
  `test.prop("Property 3: occurrence counting", ...)` or `it("Property 3: occurrence counting", () => fc.assert(...))`.
- Put a comment above each one: `// Validates: Requirements 3.4` (proxy-core), matching the spec.
- Default `numRuns: 200`; heavy properties may use 50 with a comment saying why.
- Build generators in `src/test-arbitraries.ts` per package and reuse them. Generators produce valid
  JSON-RPC messages, valid plans and valid scenarios, unless the property is about invalid input.
- Never assert on wall-clock time. Use the fake `Clock` from `core`.

## No API keys in CI
- Tests that need an agent use `FakeAgent` (`packages/runner/src/agents/fake.ts`): a deterministic script
  that calls tools according to a seeded policy and can be configured to "fall for" given hauntings.
- The reference agent's live tests are tagged `@live` and skipped unless `POLTERGEIST_LIVE=1`.

## What a good failing test shows
- The seed, the minimal counterexample, and a one-line plain-language description of the property.
