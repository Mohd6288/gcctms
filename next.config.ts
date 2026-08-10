import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Playwright drives the certificate renderer and must not be bundled —
  // it resolves its own browser driver from node_modules at runtime, and
  // bundling silently drops the data files it needs.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // …and being external is exactly why the deployed function then couldn't
  // find it. Nothing imports playwright-core statically (pdf/service.ts loads
  // it inside the function to keep a browser driver out of the page's module
  // graph), so file tracing saw no reason to ship its data files. Approving a
  // certificate on Vercel died with "Cannot find module
  // '/var/task/node_modules/playwright-core/browsers.json'" — a packaging
  // failure that reached the admin as "Something went wrong."
  //
  // The key is a route glob matched by picomatch with `contains: true`
  // against the normalized route (`/[locale]/admin/classes/[id]` — route
  // groups are stripped), so it matches on a substring and the route's own
  // brackets would otherwise read as a character class. `?` sidesteps them
  // entirely: it matches the single `[` and `]` around `id` and nothing else.
  //
  // Narrow on purpose. `/*/admin/classes/*` also matched the class list and
  // the new-class route, dragging ~95MB of browser into two functions that
  // never render a PDF. Certificate approval lives on the class detail
  // screen and nowhere else.
  outputFileTracingIncludes: {
    "admin/classes/?id?": ["./node_modules/playwright-core/**/*", "./node_modules/@sparticuz/chromium/**/*"],
  },
  experimental: {
    // Uploads go through a Server Action (uploadDocumentAction), whose body
    // defaults to 1MB — so storage/service.ts's documented 10MB limit was a
    // lie for anything bigger: the request died with "Body exceeded 1 MB
    // limit" (HTTP 413) before our own size check ever ran. A scanned Iqama
    // or a photographed certificate clears 1MB easily. Headroom above 10MB
    // covers multipart overhead so the friendly message from
    // isAcceptableFile/MAX_SIZE_BYTES is what a user actually sees.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // Baseline security headers — no CSP yet (this app renders Supabase
  // Storage signed-URL images and next/font at hydration; a strict CSP
  // needs a real per-page verification pass, not a same-sitting add here).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// Sentry wraps outermost so it can see the finished config, including the
// file-tracing rules above. Source map upload is what turns a minified stack
// into a file and a line number; it needs SENTRY_AUTH_TOKEN, which the
// Marketplace integration injects on Vercel and which is absent locally — so
// local builds simply skip the upload rather than fail.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // The build log is not where anyone looks for Sentry news.
  silent: !process.env.CI,
  // Hide the source maps themselves from the public bundle after upload —
  // this app's client code should not be readable from the browser.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Routes ad-blocked "sentry.io" calls through our own origin, so browser
  // errors from a contractor behind a corporate filter still arrive.
  tunnelRoute: "/monitoring",
  // disableLogger deliberately omitted: deprecated, and its replacement
  // (webpack.treeshake.removeDebugLogging) is a webpack option this project
  // cannot use — it builds with Turbopack.
});
