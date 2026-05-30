import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    coverage: {
      provider:  "v8",
      reporter:  ["text", "json", "html"],
      include:   ["src/services/**", "src/lib/**", "src/utils/**"],
      exclude:   ["src/lib/prisma.ts", "src/lib/logger.ts"],
      thresholds: { lines: 60, functions: 60, branches: 50 },
    },
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
})
