import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
};

// Compose: withSentryConfig wraps the next-intl-wrapped config so source
// maps upload + tunnel route + Sentry webpack plugin layer on top of the
// i18n message resolution. Order matters — Sentry must be the outermost.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "intuitionai",
  project: "yoboss-web",

  // Pulled from .env.sentry-build-plugin (local) or Vercel env (prod).
  // Without it, source maps still build but won't upload — stack traces
  // in Sentry would point at minified bundle line numbers.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Ship a wider set of client chunks so cross-bundle stack frames resolve.
  widenClientFileUpload: true,

  // Proxy Sentry ingest through our domain at /monitoring so ad-blockers
  // and corporate firewalls don't drop events on the floor.
  tunnelRoute: "/monitoring",

  // Quiet build output unless we're in CI.
  silent: !process.env.CI,
});
