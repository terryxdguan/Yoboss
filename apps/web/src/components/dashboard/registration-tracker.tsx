"use client";

import { useEffect } from "react";
import { trackCompleteRegistration } from "@/lib/meta-pixel";

// Fires Meta Pixel CompleteRegistration the first time a freshly-created
// user lands on the dashboard. Both auth paths (OAuth callback, email
// confirm) eventually redirect here, so this is the single funnel point.
//
// "Fresh" = account created within the last 60s. Coupled with a per-user
// sessionStorage flag so a slow tab or a refresh inside that window
// doesn't double-fire. The 60s window is a backstop in case sessionStorage
// is cleared before the user lands here.
const RECENT_SIGNUP_MS = 60_000;

export function RegistrationTracker({
  userId,
  createdAtIso,
}: {
  userId: string;
  createdAtIso: string;
}) {
  useEffect(() => {
    const createdAt = new Date(createdAtIso).getTime();
    if (Number.isNaN(createdAt)) return;
    if (Date.now() - createdAt > RECENT_SIGNUP_MS) return;

    const flagKey = `meta_pixel_registration_fired:${userId}`;
    if (sessionStorage.getItem(flagKey)) return;

    trackCompleteRegistration();
    sessionStorage.setItem(flagKey, "1");
  }, [userId, createdAtIso]);

  return null;
}
