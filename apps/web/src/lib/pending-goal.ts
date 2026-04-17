// Cross-tab handoff for the goal a visitor types on the landing page
// before they have an account. The /auth/confirm page (opened from the
// email-confirmation link, possibly in a different tab than where they
// originally typed) needs to know "was a goal pending?" to decide where
// to land the user — sessionStorage is per-tab so it can't carry that
// across the email round-trip. A short-lived cookie can.
//
// We also write to sessionStorage as a belt-and-suspenders fallback for
// the same-tab path (Google OAuth, immediate login) in case cookies are
// blocked by privacy mode.

const KEY = "pendingGoal";
const MAX_AGE_SECONDS = 60 * 60; // 1h is plenty for "type goal → check email → click link"

export function setPendingGoal(text: string): void {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(text);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // SameSite=Lax: still sent on the top-level GET navigation that
  // brings the user back from the email confirmation flow.
  document.cookie = `${KEY}=${encoded}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  try {
    window.sessionStorage.setItem(KEY, text);
  } catch {
    // sessionStorage unavailable; the cookie will carry it.
  }
}

export function getPendingGoal(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${KEY}=([^;]*)`)
  );
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingGoal(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // No-op.
  }
}

export function hasPendingGoal(): boolean {
  return getPendingGoal() !== null;
}
