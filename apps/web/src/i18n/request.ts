import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { pickLocaleFromAcceptLanguage } from "./detect";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headerStore = await headers();
    locale = pickLocaleFromAcceptLanguage(headerStore.get("accept-language"));
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: "UTC",
    now: new Date(),
    onError: (error) => {
      // Treat missing keys as a build-time / dev concern only — silently fall
      // back to the key in production so a stray missing string never
      // crashes a page.
      if (process.env.NODE_ENV === "production") return;
      // eslint-disable-next-line no-console
      console.warn("[next-intl]", error.message);
    },
    getMessageFallback: ({ key, namespace }) => {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

export { defaultLocale };
