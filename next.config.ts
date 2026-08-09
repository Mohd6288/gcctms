import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Playwright drives the certificate renderer and must not be bundled —
  // it resolves its own browser driver from node_modules at runtime, and
  // bundling silently drops the data files it needs.
  serverExternalPackages: ["playwright", "playwright-core"],
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

export default withNextIntl(nextConfig);
