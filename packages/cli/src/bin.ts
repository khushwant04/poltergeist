#!/usr/bin/env node
import { Command, Option } from "commander";
import { POLTERGEIST_VERSION } from "@poltergeist/core";
import { runHaunt, runList, runScore } from "./live-commands.js";
import { runPlan } from "./plan-command.js";
import { runRegressionSuite, runReplay, runShrink } from "./replay-commands.js";
import { runRun } from "./run-command.js";
import { runMcp } from "./mcp-server.js";
import { startUiServer } from "./ui-server.js";
import { exportBundles } from "@poltergeist/runner";
import { resolve } from "node:path";
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
  .option("--regressions <dir>", "with --suite regressions: where regression cases live", "scenarios/regressions")
  .action(async (opts) => {
    process.exit(opts.suite === "regressions" ? await runRegressionSuite(opts) : await runRun(opts));
  });

program
  .command("replay")
  .description("Run a recorded run again: env (same plan, live agent) or full (exact, from the recording)")
  .argument("<runId>")
  .option("--mode <mode>", "env or full", "full")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .option("--force", "replay even if versions differ")
  .action(async (runId: string, opts) => {
    process.exit(await runReplay(runId, opts));
  });

program
  .command("shrink")
  .description("Reduce a failing run to the smallest plan that still fails, and save it as a regression case")
  .argument("<runId>")
  .requiredOption("--target <oracle>", "the failing oracle to keep failing (e.g. canary-leak)")
  .option("--trials <k>", "trials per candidate (majority vote)", "3")
  .option("--budget <n>", "maximum trials for the search", "40")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .option("--regressions <dir>", "where to save the regression case", "scenarios/regressions")
  .option("--no-save", "do not save a regression case")
  .option("--force", "shrink even if versions differ")
  .action(async (runId: string, opts) => {
    process.exit(await runShrink(runId, opts));
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

program
  .command("ui")
  .description("Open the Séance Room on your local runs (follows runs that are still recording)")
  .option("--port <n>", "port", "8737")
  .option("--host <host>", "host to bind (default 127.0.0.1)")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .option("--live", "accepted for compatibility; live runs are always followed")
  .action(async (opts: { port: string; host?: string; home?: string }) => {
    const ui = await startUiServer({ port: Number(opts.port), ...(opts.host ? { host: opts.host } : {}), ...(opts.home ? { home: opts.home } : {}) });
    process.stderr.write(`[poltergeist] Séance Room at ${ui.url}\n`);
  });

program
  .command("export")
  .description("Write run bundles (and an index and catalogue) for the static Séance Room")
  .argument("[runIds...]", "runs to export (default: all)")
  .requiredOption("--out <dir>", "output folder (bundles/ is created inside it)")
  .option("--home <dir>", "where runs are stored (default .poltergeist)")
  .option("--regressions <dir>", "regression cases to attach as shrink results", "scenarios/regressions")
  .option("--redact <regex>", "redact matches before writing (repeatable)", (v: string, acc: string[]) => [...acc, v], [] as string[])
  .action(async (runIds: string[], opts: { out: string; home?: string; regressions: string; redact: string[] }) => {
    const index = await exportBundles(resolve(opts.out), runIds.length > 0 ? runIds : "all", {
      regressionsDir: resolve(opts.regressions),
      redact: opts.redact.map((r) => new RegExp(r, "g")),
      ...(opts.home ? { home: opts.home } : {}),
    });
    process.stderr.write(`[poltergeist] exported ${index.runs.length} run(s) to ${resolve(opts.out, "bundles")}\n`);
    process.exit(0);
  });

program
  .command("mcp")
  .description("Run Poltergeist as an MCP server (stdio) so an IDE agent can run, report, replay and shrink hauntings")
  .option("--root <dir>", "repository root (scenarios/ must be inside it)", process.cwd())
  .option("--home <dir>", "where runs are stored (default <root>/.poltergeist)")
  .action(async (opts: { root: string; home?: string }) => {
    await runMcp(opts);
  });

program.passThroughOptions(false);
await program.parseAsync(process.argv);
