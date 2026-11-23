---
inclusion: fileMatch
fileMatchPattern: ["packages/core/**", "packages/hauntings/**", "packages/oracles/**", "packages/replay/**", "packages/runner/src/plan*", "packages/runner/src/canar*"]
---

# Determinism rules

Reproducibility is the product. A seed must always mean the same thing.

1. **No ambient randomness.** `Math.random`, `crypto.randomUUID` and `crypto.getRandomValues` are banned
   in plan generation, haunting `apply`, canary derivation, oracles, scoring and shrink decisions.
   Randomness comes only from the seed: fast-check arbitraries for plans, `core/rng` (seeded) elsewhere.
2. **No ambient time.** `Date.now()` and `new Date()` are banned in the same code. Take a `Clock` argument.
   Real time is used only by the proxy's effect executor (actual delays) and the recorder (timestamps).
3. **All randomness happens at plan time.** A haunting's parameters are fully decided when the plan is
   generated. `apply` is a pure function of (message, params, engine state) and never draws random numbers.
4. **Address messages by occurrence, never by global sequence.** A plan targets "the 3rd `tools/call` to
   `read_file`", not "message #17". Agents vary between runs; occurrence addressing keeps plans meaningful.
5. **Stable ordering.** Never iterate a `Map`, `Set` or object to produce output without sorting by a
   stable key first. Arrays of hauntings apply in plan order.
6. **Canonical JSON for every hash** (`core/canonical-json`). Plan hash, request hash, args hash.
7. **Version everything that changes meaning.** Plans carry `catalogVersion`; traces carry the Poltergeist,
   catalog and fast-check versions. Replay refuses a version mismatch unless `--force` is given.
8. **Every property test prints its seed on failure** and can be rerun with it (`fc.assert(..., { seed })`).
