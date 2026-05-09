// Client-side Meta Pixel helpers. These are no-ops when:
//   - running on the server,
//   - the user has not accepted the cookie banner (fbq is never injected
//     in that case — see <MetaPixel /> in cookie-consent.tsx),
//   - or NEXT_PUBLIC_META_PIXEL_ID is not configured.
//
// Callers don't need to gate on consent themselves — these helpers are
// safe to call unconditionally.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

function fbq(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;
  window.fbq(...args);
}

export function trackPageView(): void {
  fbq("track", "PageView");
}

export function trackCompleteRegistration(): void {
  fbq("track", "CompleteRegistration");
}

export function trackPurchase(valueCents: number, currency: string): void {
  fbq("track", "Purchase", {
    value: valueCents / 100,
    currency,
  });
}
