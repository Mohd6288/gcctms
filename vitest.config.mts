import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
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
