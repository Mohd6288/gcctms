import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which only
    // Next.js's own bundler resolves otherwise.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // Resolves "server-only" to its no-op export (empty.js) instead of the
    // throwing default, so server-only modules stay unit-testable.
    conditions: ["react-server"],
  },
  ssr: {
    resolve: {
      conditions: ["react-server"],
    },
  },
});
