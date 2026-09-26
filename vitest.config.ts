import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    exclude: ["node_modules/**", ".next/**", ".kilo/**", "tests/e2e/**"],
    // Coverage configuration (quality lane gap `coverage:tooling_absent`).
    // `npm run test:coverage` runs the whole unit suite through the v8
    // provider and reports a line total; CI fails on a regression below the
    // measured floor. Reports land in ./coverage; of those, only
    // ./coverage/coverage-summary.json is committed (quality lane gap
    // `coverage:not_published`), because the quality lane reads a percentage
    // from the repository tree with a 400 000-character limit and this suite's
    // lcov report (~484 KB) does not fit in it — read back, lcov would be
    // truncated to the first ~80% of the tree (measured 60.24% instead of
    // 65.08%). Keep the `json-summary` reporter and this path together: moving
    // the report makes the published coverage unreadable.
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "json", "json-summary", "lcov"],
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "db/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__mocks__/**",
        "**/node_modules/**",
      ],
      // Fail-under floors (quality lane gap `coverage:not_enforced`). Pinned at
      // the totals measured on the card's base commit main@a5e65d4 through this
      // same command — lines 65.08% (7728/11873), statements 62.71%
      // (8604/13719), functions 64% (2036/3181), branches 55.04% (6999/12715) —
      // floored to whole points, so any run below them fails. The CI test job
      // passes the same line floor to `vitest --coverage` explicitly
      // (see the `minimum_coverage` step in .github/workflows/ci.yml):
      // change both together. Raise as coverage improves; never lower a floor
      // to make a red build green.
      thresholds: {
        lines: 65,
        statements: 62,
        functions: 64,
        branches: 55,
      },
    },
  },
});
