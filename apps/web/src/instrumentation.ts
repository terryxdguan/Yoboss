import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures unhandled errors thrown inside server components, route
// handlers, server actions, and middleware. Requires @sentry/nextjs >= 8.28.
export const onRequestError = Sentry.captureRequestError;
