import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";

describe("FakeClock", () => {
  it("runs due timers in time order, including ones scheduled during advance", () => {
    const c = new FakeClock(100);
    const order: string[] = [];
    c.setTimeout(() => order.push("b@30"), 30);
    c.setTimeout(() => {
      order.push("a@10");
      c.setTimeout(() => order.push("c@15"), 5);
    }, 10);
    const cancelled = c.setTimeout(() => order.push("never"), 20);
    c.clearTimeout(cancelled);
    c.advance(25);
    expect(order).toEqual(["a@10", "c@15"]);
    expect(c.now()).toBe(125);
    c.advance(10);
    expect(order).toEqual(["a@10", "c@15", "b@30"]);
  });
});
