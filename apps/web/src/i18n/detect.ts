import { defaultLocale, isLocale, locales, type Locale } from "./config";

/**
 * Parse an Accept-Language header and pick the best supported locale.
 * Falls back to defaultLocale when no tag matches.
 */
export function pickLocaleFromAcceptLanguage(
  header: string | null | undefined
): Locale {
  if (!header) return defaultLocale;

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...rest] = part.trim().split(";");
      const qPart = rest.find((s) => s.trim().startsWith("q="));
      const q = qPart ? Number(qPart.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((c) => c.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
    if (isLocale(tag) && (locales as readonly string[]).includes(tag)) {
      return tag as Locale;
    }
  }

  return defaultLocale;
}
