// Builds the static Séance Room with the recorded demo runs: pnpm demo:build → packages/ui/dist
import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

execSync("pnpm --filter @poltergeist/ui build", { stdio: "inherit" });
if (!existsSync("demo/bundles/index.json")) {
  console.error("demo/bundles is missing; run pnpm demo:record first"); // lint-allow
  process.exit(1);
}
rmSync("packages/ui/dist/bundles", { recursive: true, force: true });
cpSync("demo/bundles", "packages/ui/dist/bundles", { recursive: true });
console.error("static Séance Room ready in packages/ui/dist"); // lint-allow
