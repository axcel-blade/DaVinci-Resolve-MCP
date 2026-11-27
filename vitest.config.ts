import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
          setupFiles: ["tests/setup.ts"],
    projects: [
      {
        test: {
          name: "default",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
          environment: "node",
          testTimeout: 30000,
        },
      },
      {
        /** e2e tests drive the real DaVinci Resolve. Run with: pnpm test:live (Resolve must be running). */
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          environment: "node",
          testTimeout: 600000,
          hookTimeout: 120000,
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
});
