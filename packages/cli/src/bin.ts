#!/usr/bin/env node
import { Command, Option } from "commander";
import { POLTERGEIST_VERSION } from "@poltergeist/core";
import { runHaunt, runList, runScore } from "./live-commands.js";
import { runPlan } from "./plan-command.js";
import { runRun } from "./run-command.js";
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

program
  .command("run")
  .description("Run an agent against a scenario or a suite, judge it and print a resilience score")
  .option("--scenario <id|file>", "scenario id (from scenarios/) or path")
  .option("--suite <name|file>", "suite name (from scenarios/suites/) or path")
  .option("--agent <name>", "fake, reference or reference-hardened (default: the suite's, else fake)")
  .option("--fall-for <hauntings>", "fake agent only: comma-separated hauntings it obeys (possession, whisper)")
  .option("--seed <n>", "seed for a single scenario", "1")
  .option("--trials <k>", "trials per seed for a single scenario", "1")
  .option("--junit <file>", "write JUnit XML")
  .option("--json <file>", "write a JSON summary")
  .option("--min-score <n>", "exit 1 when the score is below this")
  .option("--max-drop <n>", "exit 1 when the score drops more than this against --baseline")
  .option("--baseline <file>", "baseline JSON ({\"score\": n})")
  .option("--write-baseline <file>", "write this run's score as a baseline")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .option("--timeout <sec>", "override the scenario's time limit")
  .option("--quiet", "one line per run")
  .action(async (opts) => {
    process.exit(await runRun(opts));
  });

program
  .command("haunt")
  .description("Serve a haunted fixture world over stdio to any MCP client (live mode); score it afterwards")
  .requiredOption("--scenario <id|file>", "scenario id or path")
  .option("--seed <n>", "seed", "1")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .addOption(new Option("--log-level <level>", "stderr log level").choices(["silent", "error", "warn", "info", "debug"]).default("info"))
  .action(async (opts) => {
    process.exit(await runHaunt(opts));
  });

program
  .command("score")
  .description("Judge a recorded run (e.g. one from `poltergeist haunt`)")
  .argument("<runId>")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .action(async (runId: string, opts) => {
    process.exit(await runScore(runId, opts));
  });

program
  .command("runs")
  .description("List recent runs")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .option("--limit <n>", "how many", "20")
  .action((opts) => {
    process.exit(runList(opts));
  });

program.passThroughOptions(false);
await program.parseAsync(process.argv);
