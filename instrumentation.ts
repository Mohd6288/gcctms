import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Without this, an error thrown inside a Server Component is swallowed by
// React's error boundary and never reaches Sentry — which is exactly the
// class of fault that reached production as a bare "Minified React error".
export const onRequestError = Sentry.captureRequestError;
