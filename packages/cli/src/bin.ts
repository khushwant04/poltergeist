#!/usr/bin/env node
import { Command, Option } from "commander";
import { POLTERGEIST_VERSION } from "@poltergeist/core";
import { runPlan } from "./plan-command.js";
import { runWrap } from "./wrap.js";

const program = new Command()
  .name("poltergeist")
  .description("Chaos testing for AI agents: an MCP proxy that haunts your agent on purpose.")
  .version(POLTERGEIST_VERSION);

program
  .command("wrap")
  .description("Proxy an MCP server: `poltergeist wrap [options] -- <command> [args...]`, or --upstream for HTTP")
  .argument("[command...]", "server command and its arguments (after --)")
  .option("--plan <file>", "haunting plan (JSON)")
  .option("--seed <n>", "seed for plan generation (with --scenario)")
  .option("--scenario <path>", "scenario file (with --seed)")
  .option("--record <dir>", "directory for traces", ".poltergeist/runs")
  .option("--no-record", "do not write a trace")
  .option("--redact <regex>", "redact matches of this pattern in traces (repeatable)", (v: string, acc: string[]) => [...acc, v], [] as string[])
  .option("--upstream <url>", "proxy a Streamable HTTP server at this URL")
  .option("--listen <port>", "port for the HTTP proxy (with --upstream)")
  .option("--host <host>", "host to bind the HTTP proxy (default 127.0.0.1)")
  .addOption(new Option("--log-level <level>", "stderr log level").choices(["silent", "error", "warn", "info", "debug"]).default("warn"))
  .action(async (command: string[], opts) => {
    const code = await runWrap(command, opts);
    process.exit(code);
  });

program
  .command("plan")
  .description("Show the haunting plan a seed produces for a scenario")
  .requiredOption("--seed <n>", "seed (0 to 4294967295)")
  .requiredOption("--scenario <file>", "scenario YAML")
  .option("--out <file>", "write the plan to a file instead of stdout")
  .action((opts: { seed: string; scenario: string; out?: string }) => {
    process.exit(runPlan(opts));
  });

program.passThroughOptions(false);
await program.parseAsync(process.argv);
