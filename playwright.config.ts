import { defineConfig } from "@playwright/test";

// Browser tests were run by hand all through development, which is how three
// UI faults reached production in one evening: a page-wide horizontal
// overflow, untranslated keys rendering as `admin.foo.bar`, and a broken
// QR image on the one screen standing between a new trainer and their first
// sign-in. None of those are visible to a unit test. This runs them in CI.
export default defineConfig({
  testDir: "./e2e",
  // The suite asserts on a real production build, because two of the faults
  // above only appear in one (minified React errors, file tracing).
  webServer: {
    command: "npx next start",
    url: "http://127.0.0.1:3000/en/sign-in",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The E2E account skips MFA. Dev-only mechanism, and CI is as dev as it
      // gets — never set on the environment real companies use.
      NEXT_PUBLIC_MFA_BYPASS_EMAILS: "e2e-superadmin@gcclab.test",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
});
