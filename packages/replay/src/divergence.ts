export type DivergenceKind = "llm" | "tool" | "frame";

/** A replay stopped matching the recording. */
export class DivergenceError extends Error {
  constructor(
    readonly kind: DivergenceKind,
    /** LLM call index, or frame index in the trace. */
    readonly step: number,
    readonly expected: unknown,
    readonly actual: unknown,
    message?: string,
  ) {
    super(message ?? `replay diverged at ${kind} step ${step}`);
    this.name = "DivergenceError";
  }
}
