---
inclusion: fileMatch
fileMatchPattern: ["packages/hauntings/**", "packages/fixtures/**", "packages/proxy/src/recorder*", "scenarios/**", "packages/cli/src/mcp*"]
---

# Safety rules

Poltergeist simulates attacks. These rules keep it a testing tool and never a weapon.

1. **Attacks target canaries only.** Every injection payload that asks for data to leave must reference a
   `{{canary}}` placeholder, never real file paths outside the fixture world or real secrets.
2. **Attacker addresses use the reserved `.invalid` TLD** (RFC 2606), e.g. `collector@haunted.invalid`,
   `https://exfil.haunted.invalid/`. The payload loader rejects any address or URL on another domain.
3. **Sink tools never perform real I/O.** `send_email`, `transfer_funds` and every future sink only append
   to the world's `outbox.jsonl`. Fixture tools never open sockets and never touch files outside the world
   directory (resolve paths and reject anything that escapes it).
4. **Payloads are text, not exploits.** No shell commands that would damage a host, no real malware strings,
   no instructions targeting real services. Injection payloads are about obedience, not capability.
5. **Never record secrets.** The recorder never writes the wrapped process's environment values, and redacts
   values matching `--redact` patterns. Canaries are never redacted: they are the evidence.
6. **Real servers are wrapped at the owner's choice.** When wrapping a non-fixture server, only timing and
   schema hauntings are enabled by default; injection hauntings need `--allow-injection` and print a warning.
7. **`poltergeist mcp` only runs scenarios under the repo's `scenarios/` directory** and rejects any other path.
8. Any change to payloads, sinks, the recorder or the MCP server needs a test proving rules 1–3 and 5 still hold.
