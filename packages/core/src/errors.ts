export type ErrorCode = "invalid_input" | "spawn_failed" | "not_available" | "internal";

/** CLI exit codes: 0 ok, 1 test failure, 2 invalid input, 3 internal error. */
export const EXIT = { ok: 0, testFailure: 1, invalidInput: 2, internal: 3 } as const;

export class PoltergeistError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "PoltergeistError";
  }

  get exitCode(): number {
    return this.code === "internal" ? EXIT.internal : EXIT.invalidInput;
  }
}
