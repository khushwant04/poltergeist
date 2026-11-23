export type TimerHandle = { readonly id: number };

/** Injectable time source. Real time lives only at the edges (proxy effects, recorder). */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export class RealClock implements Clock {
  private next = 1;
  private readonly timers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();

  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.next++;
    this.timers.set(
      id,
      globalThis.setTimeout(() => {
        this.timers.delete(id);
        fn();
      }, ms),
    );
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    const t = this.timers.get(handle.id);
    if (t !== undefined) globalThis.clearTimeout(t);
    this.timers.delete(handle.id);
  }
}

/** A manual clock for tests: time only moves when `advance` is called. */
export class FakeClock implements Clock {
  private current: number;
  private next = 1;
  private timers: Array<{ id: number; at: number; fn: () => void }> = [];

  constructor(start = 0) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.next++;
    this.timers.push({ id, at: this.current + Math.max(0, ms), fn });
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers = this.timers.filter((t) => t.id !== handle.id);
  }

  /** Move time forward, running due timers in order (timers created meanwhile run too if due). */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (due === undefined) break;
      this.timers = this.timers.filter((t) => t.id !== due.id);
      this.current = due.at;
      due.fn();
    }
    this.current = target;
  }

  pending(): number {
    return this.timers.length;
  }
}
