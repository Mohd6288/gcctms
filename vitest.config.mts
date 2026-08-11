import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Vitest's default glob matches **/*.spec.ts, which sweeps up the
    // Playwright suite in e2e/ — those need a browser and Playwright's own
    // runner, so vitest fails to collect them and `npm test` reports a failed
    // suite alongside 367 green tests. `npx playwright test` runs them.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
    // Every integration/RLS test file shares ONE real local Postgres
    // instance (deliberately — see feedback_test_against_real_infra.md).
    // Most tests scope assertions to their own randomUUID-suffixed fixture
    // rows, so cross-file parallelism is safe — but any test doing a global
    // aggregate (e.g. platform-overview-stats.test.ts's COUNT(*) queries)
    // is exposed to other files' concurrent inserts/deletes. Serializing
    // file execution trades a few seconds of wall time for determinism.
    fileParallelism: false,
    env: {
      // Well-known fixed local dev values `supabase start` always prints —
      // not real secrets (see ci.yml, docs/residency.md). Vitest doesn't
      // load .env.local the way Next.js does, and app code like
      // lib/supabase/admin.ts's createAdminClient() reads these directly
      // from process.env, so integration tests exercising that code need
      // them set here.
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      SUPABASE_SERVICE_ROLE_KEY:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
      NATIONAL_ID_HASH_KEY: "local-dev-placeholder-not-for-real-use",
    },
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
