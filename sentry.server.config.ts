import * as Sentry from "@sentry/nextjs";

// Server-side errors. Until now these reached Vercel's runtime logs and
// stopped there — which is how three faults were diagnosed in one evening,
// but only because somebody went looking. Nothing alerted anyone.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // No DSN (local dev, CI) means the SDK is inert rather than noisy.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? "development",

  // A B2B platform with tens of concurrent users: sampling everything costs
  // nothing here and means a rare fault is never the one that got dropped.
  tracesSampleRate: 1,

  // This application handles Iqama numbers, national ID scans and personal
  // contact details. Sending request bodies, headers or cookies to a third
  // party would quietly undo the masking the rest of the codebase enforces.
  sendDefaultPii: false,

  beforeSend(event) {
    // Belt and braces: strip anything that could carry an identity number
    // even if a future SDK default starts including it.
    delete event.request?.cookies;
    delete event.request?.data;
    if (event.request?.headers) delete event.request.headers.authorization;
    return event;
  },
});
