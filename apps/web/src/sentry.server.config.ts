import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Inline local variable values into stack frames — invaluable for
  // diagnosing AI streaming failures and Stripe webhook errors where
  // the relevant context (user id, request body) lives in locals.
  includeLocalVariables: true,

  enableLogs: true,
});
