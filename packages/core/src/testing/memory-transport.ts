import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/** A linked pair of in-memory MCP transports: what one sends, the other receives. */
export function memoryTransportPair(): [InMemoryTransport, InMemoryTransport] {
  return InMemoryTransport.createLinkedPair();
}
