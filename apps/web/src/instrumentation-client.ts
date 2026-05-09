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

  // Drop known noise that isn't actionable — both signal-zero patterns
  // we've seen repeatedly in YOBOSS-WEB-* issues:
  //
  // 1. `Object Not Found Matching Id:N, MethodName:update, ParamCount:4` —
  //    fingerprint of injected browser-extension code (commonly old
  //    Outlook SafeLinks / page-translator extensions). No stack, not our
  //    code, can't fix from our side.
  // 2. `Lock broken by another request with the 'steal' option` — benign
  //    Web Locks API rejection that fires every time Supabase's auth
  //    client steals the lock from a stale tab. Expected behavior, not
  //    an error users experience.
  ignoreErrors: [
    /Object Not Found Matching Id:\d+, MethodName:.+, ParamCount:\d+/,
    /Lock broken by another request with the 'steal' option/,
  ],

  // The Replay integration is added dynamically by CookieConsent only after
  // the user accepts cookies. Errors and perf are tracked unconditionally
  // (legitimate-interest basis); replay captures DOM and gets explicit
  // consent before activating.
});

// App Router navigation tracing — emits transactions for client-side route
// transitions so /goals → /todos hops show up in performance.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
