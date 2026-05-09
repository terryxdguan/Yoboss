import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // See sentry.server.config.ts — same scrubber, same rationale.
  beforeSend: (event) => scrubSentryEvent(event) as typeof event,

  enableLogs: true,
});
