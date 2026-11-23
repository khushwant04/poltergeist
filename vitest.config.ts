import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@poltergeist\/core\/testing$/, replacement: src("./packages/core/src/testing/index.ts") },
      { find: /^@poltergeist\/core$/, replacement: src("./packages/core/src/index.ts") },
      { find: /^@poltergeist\/proxy$/, replacement: src("./packages/proxy/src/index.ts") },
      { find: /^@poltergeist\/hauntings$/, replacement: src("./packages/hauntings/src/index.ts") },
      { find: /^@poltergeist\/fixtures$/, replacement: src("./packages/fixtures/src/index.ts") },
      { find: /^@poltergeist\/oracles$/, replacement: src("./packages/oracles/src/index.ts") },
      { find: /^@poltergeist\/runner$/, replacement: src("./packages/runner/src/index.ts") },
      { find: /^@poltergeist\/replay$/, replacement: src("./packages/replay/src/index.ts") },
    ],
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
