import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Attaches IP, user agent, cookies, etc. so issues are debuggable. Safe
  // for an authenticated B2C app — turn off if you ever need stricter PII
  // separation between users and Sentry.
  sendDefaultPii: true,

  // Performance tracing sample rate. 100% in dev to surface everything,
  // 10% in prod to stay well inside the Free Developer span quota (5M/mo).
  // If we get loud, drop to 0.05.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay quota on Free is only 50/month. Skip random sampling and
  // only record when there's an actual error — those are the replays worth
  // having anyway. Bump replaysSessionSampleRate later if we upgrade.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

// App Router navigation tracing — emits transactions for client-side route
// transitions so /goals → /todos hops show up in performance.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
