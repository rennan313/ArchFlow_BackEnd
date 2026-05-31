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
      // Phase 5.9 baseline — do not regress below these numbers
      // Target: +5pp per sprint as services are covered
      thresholds: { lines: 24, functions: 20, branches: 15 },
    },
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
})
