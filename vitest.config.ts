import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: [
        "packages/accounting/src/**/*.ts",
        "packages/card-custody/src/**/*.ts",
        "packages/diagnostics/src/**/*.ts",
        "packages/game-core/src/**/*.ts",
        "packages/identity-capabilities/src/**/*.ts",
        "packages/realtime-transport/src/**/*.ts",
        "services/connection-service/src/index.ts",
      ],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    include: [
      "packages/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/contract/**/*.test.tsx",
    ],
    restoreMocks: true,
  },
});
