import crypto from "node:crypto";

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUB_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("EMAIL_UNSUB_SECRET is not set or too short");
  }
  return secret;
}

export function signUnsubscribeToken(userId: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(userId)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  if (!token || token.length !== 32) return false;
  const expected = signUnsubscribeToken(userId);
  // Constant-time compare to avoid timing attacks
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildUnsubscribeUrl(appUrl: string, userId: string): string {
  const token = signUnsubscribeToken(userId);
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}
