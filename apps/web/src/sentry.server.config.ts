import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Inline local variable values into stack frames — invaluable for
  // diagnosing AI streaming failures and Stripe webhook errors where
  // the relevant context (user id, request body) lives in locals.
  // Combined with sendDefaultPii=true this would otherwise ship API
  // keys, raw Stripe bodies, and full chat messages on every server
  // exception; `beforeSend` scrubs those secret-shaped keys before
  // transport. See lib/observability/sentry-scrub.ts.
  includeLocalVariables: true,

  beforeSend: (event) => scrubSentryEvent(event) as typeof event,

  enableLogs: true,
});
