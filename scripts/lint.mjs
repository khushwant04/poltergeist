// Repository rules that TypeScript cannot check (see .kiro/steering).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const problems = [];

function* files(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.endsWith("test-arbitraries.ts")) yield p;
  }
}

const check = (pkgs, pattern, message) => {
  for (const pkg of pkgs) {
    for (const file of files(join(root, "packages", pkg, "src"))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (pattern.test(line) && !line.includes("lint-allow")) problems.push(`${relative(root, file)}:${i + 1}: ${message}`);
        });
    }
  }
};

// stdout is the MCP protocol channel.
check(["core", "proxy", "cli", "fixtures"], /console\.(log|info|debug)\(|process\.stdout\.write\(/, "stdout is reserved for MCP messages; log to stderr");
// Determinism.
check(["hauntings", "oracles", "replay"], /Math\.random|crypto\.randomUUID|getRandomValues|Date\.now\(|new Date\(/, "no ambient randomness or time; use the seeded RNG or the Clock");
// Dependency rules.
check(["core"], /from "@poltergeist\//, "core must not depend on other packages");
check(["proxy", "hauntings", "oracles", "fixtures"], /from "@poltergeist\/(?!core)/, "this package may only depend on @poltergeist/core");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.error("lint: ok");
