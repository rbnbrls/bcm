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
    // measured floor. Reports land in ./coverage (git-ignored).
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
      // Regression floors, set a few points below the totals measured on
      // main@9908f58 through this same command (lines 65.08%, statements
      // 62.71%, functions 64%, branches 55.04%). They gate a regression
      // without failing on ordinary suite variance; raise them as coverage
      // improves.
      thresholds: {
        lines: 60,
        statements: 58,
        functions: 60,
        branches: 50,
      },
    },
  },
});
