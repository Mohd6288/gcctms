import { expect, test, type Page } from "@playwright/test";

// The classes of fault that only a browser catches, checked on every page an
// admin actually uses. Each assertion here corresponds to something that
// reached production once:
//
//  - a page-wide horizontal scroll, which hid the region dropdown and both
//    recovery buttons under the viewport edge;
//  - untranslated keys rendering as `admin.overview.statCompanies`;
//  - a Server Component render error, which surfaces as a minified React
//    error code where the reason should be.
const ADMIN_PAGES = [
  "/en/superadmin",
  "/en/superadmin/catalog",
  "/en/superadmin/centers",
  "/en/superadmin/cities",
  "/en/superadmin/trainers",
  "/en/superadmin/users",
];

// Untranslated next-intl output looks like `namespace.key.path`. Matching the
// real namespaces avoids flagging ordinary prose containing a full stop.
const UNTRANSLATED = /\b(admin|auditor|contractor|trainer|superadmin|common|profile|auth|nav)\.[a-zA-Z]+\.[a-zA-Z.]+/;

// networkidle is deliberately avoided throughout: it waits for the network to
// go quiet, which never quite happens on a page holding a connection open, and
// it fails as a timeout that looks like a broken page. Waiting for the thing
// the assertion needs is both faster and honest about what it is waiting for.
async function ready(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "load" });
  await page.locator("h1, main").first().waitFor({ state: "visible", timeout: 20_000 });
  return response;
}

async function signIn(page: Page) {
  await page.goto("/en/sign-in", { waitUntil: "load" });
  // The form is a client component; clicking before hydration silently drops
  // the submit and the test waits on a page that was never going to navigate.
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', "e2e-superadmin@gcclab.test");
  await page.fill('input[type="password"]', "E2ePassw0rd!");
  // Scoped to the sign-in card: the app shell has its own submit button
  // (sign out), and it comes first in the DOM.
  await page.locator('form:has(input[type="password"]) button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 30_000 });
}

test.describe("admin surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const path of ADMIN_PAGES) {
    test(`${path} renders without overflow, raw keys, or a render error`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => consoleErrors.push(String(error)));

      const response = await ready(page, path);
      expect(response?.status(), "http status").toBeLessThan(400);
      expect(new URL(page.url()).pathname, "should not have been redirected away").toBe(path);

      const body = await page.innerText("body");
      expect(body, "untranslated i18n key on screen").not.toMatch(UNTRANSLATED);
      // The wrapper React shows in production when a Server Component throws.
      expect(body).not.toContain("Minified React error");

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(overflow.clientWidth);

      expect(consoleErrors, "uncaught errors on the page").toEqual([]);
    });
  }

  // Narrow viewports are where a flex child that cannot shrink shows itself.
  test("holds up at 1024px, where the overflow bug first appeared", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    for (const path of ADMIN_PAGES) {
      await ready(page, path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `${path} scrolls sideways at 1024px`).toBe(false);
    }
  });

  test("the create panel opens and puts the caret in the first field", async ({ page }) => {
    await ready(page, "/en/superadmin/cities");
    await page.getByRole("button", { name: /add city/i }).click();
    await expect(page.locator("#city-name")).toBeFocused();
  });
});

test("the Arabic locale renders right-to-left", async ({ page }) => {
  await signIn(page);
  await ready(page, "/ar/superadmin/trainers");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const body = await page.innerText("body");
  expect(body).not.toMatch(UNTRANSLATED);
});
