import * as Sentry from "@sentry/nextjs";

// The proxy (network-boundary routing) runs here. Same privacy stance as the
// server config — see the comments there.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 1,
  sendDefaultPii: false,
});
