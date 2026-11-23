import type { Direction, RequestContext } from "@poltergeist/core";

/**
 * Remembers open requests so responses can be matched to them by JSON-RPC id.
 * Requests flow both ways in MCP (the server can ask the client too), so the key includes direction.
 */
export class Correlator {
  private readonly open = new Map<string, RequestContext>();

  private static key(dir: Direction, id: string | number): string {
    return `${dir}\u0000${typeof id}\u0000${String(id)}`;
  }

  track(ctx: RequestContext): void {
    this.open.set(Correlator.key(ctx.dir, ctx.id), ctx);
  }

  /** Resolve a response travelling in `responseDir` to the request that went the other way. */
  resolve(responseDir: Direction, id: string | number): { request?: RequestContext; orphan: boolean } {
    const requestDir: Direction = responseDir === "s2c" ? "c2s" : "s2c";
    const key = Correlator.key(requestDir, id);
    const request = this.open.get(key);
    if (request === undefined) return { orphan: true };
    this.open.delete(key);
    return { request, orphan: false };
  }

  get size(): number {
    return this.open.size;
  }
}
