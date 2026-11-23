/** Counts requests per (method, tool name) in arrival order, starting at 1. */
export class OccurrenceCounter {
  private readonly counts = new Map<string, number>();

  next(method: string, toolName?: string): number {
    const key = `${method}\u0000${toolName ?? ""}`;
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }
}
