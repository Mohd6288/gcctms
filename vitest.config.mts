import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
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
