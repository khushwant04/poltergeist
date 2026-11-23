import type { TraceLine } from "@poltergeist/core";
import { DivergenceError } from "./divergence.js";

export interface CassetteEntry {
  i: number;
  requestHash: string;
  response: unknown;
}

export const cassetteOf = (lines: readonly TraceLine[]): CassetteEntry[] =>
  lines.filter((l): l is Extract<TraceLine, { type: "llm" }> => l.type === "llm").sort((a, b) => a.i - b.i);

/**
 * Serves recorded model responses in order. Before answering call i it checks that the request
 * hashes to what was recorded, so a changed conversation is caught at the first call it affects.
 */
export class LlmStub<Req, Res> {
  private next = 0;
  divergence: DivergenceError | null = null;

  constructor(
    private readonly cassette: readonly CassetteEntry[],
    private readonly hashRequest: (req: Req) => string,
  ) {}

  readonly create = async (req: Req): Promise<Res> => {
    const i = this.next++;
    const entry = this.cassette[i];
    const actual = this.hashRequest(req);
    if (entry === undefined) {
      this.divergence ??= new DivergenceError("llm", i, null, actual, `the agent made LLM call ${i}, but the recording has only ${this.cassette.length}`);
      throw this.divergence;
    }
    if (entry.requestHash !== actual) {
      this.divergence ??= new DivergenceError("llm", i, entry.requestHash, actual, `LLM request ${i} differs from the recording`);
      throw this.divergence;
    }
    return structuredClone(entry.response) as Res;
  };

  get used(): number {
    return this.next;
  }
}
