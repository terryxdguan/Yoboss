import type { User } from "@supabase/supabase-js";

// Email-allowlist admin gate. Set ADMIN_EMAILS=a@x.com,b@y.com in env.
// Used by /admin/* pages and any internal-only API routes.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export function isAdmin(user: User | null | undefined): boolean {
  return isAdminEmail(user?.email);
}
