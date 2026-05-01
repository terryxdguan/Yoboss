"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// Last-resort boundary — catches errors thrown above any route segment's
// own error.tsx. Sentry needs this explicit capture because `global-error`
// runs in its own React tree where the auto-instrumentation can't reach.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
