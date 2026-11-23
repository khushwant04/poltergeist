#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ALL_MODULES, createFixtureServer, type Module } from "./server.js";
import { World } from "./world.js";

const { values } = parseArgs({ options: { world: { type: "string" }, modules: { type: "string" } } });
if (!values.world) {
  process.stderr.write("usage: poltergeist-fixtures --world <dir> [--modules files,mail,calendar,bank]\n");
  process.exit(2);
}
const modules = (values.modules ? values.modules.split(",").map((m) => m.trim()) : [...ALL_MODULES]) as Module[];
const unknown = modules.filter((m) => !ALL_MODULES.includes(m));
if (unknown.length > 0) {
  process.stderr.write(`unknown modules: ${unknown.join(", ")}\n`);
  process.exit(2);
}
const server = createFixtureServer(new World(values.world), modules);
await server.connect(new StdioServerTransport());
