"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Check } from "lucide-react";
import { setLocaleAction } from "@/i18n/actions";
import { locales, localeNames, type Locale } from "@/i18n/config";

type Variant = "icon" | "row";

interface LanguageSwitcherProps {
  variant?: Variant;
  className?: string;
}

export function LanguageSwitcher({
  variant = "icon",
  className = "",
}: LanguageSwitcherProps) {
  const currentLocale = useLocale() as Locale;
  const tNav = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = (locale: Locale) => {
    setOpen(false);
    if (locale === currentLocale) return;
    startTransition(async () => {
      await setLocaleAction(locale);
    });
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={isPending}
          aria-label={tNav("changeLanguage")}
          className="h-10 w-10 flex items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFFFF] text-[#6F6A64] hover:bg-[#F6F3EE] hover:text-[#2B2B2B] transition-colors disabled:opacity-60"
        >
          <Globe className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#E7DED2] bg-white text-sm font-medium text-[#2B2B2B] hover:bg-[#F6F3EE] transition-colors disabled:opacity-60"
        >
          <Globe className="h-4 w-4 text-[#6F6A64]" />
          <span>{localeNames[currentLocale] ?? localeNames.en}</span>
        </button>
      )}

      {open && (
        <div
          className={`absolute z-50 ${variant === "icon" ? "right-0" : "left-0"} top-full mt-2 w-44 bg-[#FFFFFF] border border-[#E7DED2] rounded-xl shadow-[0_12px_40px_rgba(30,34,39,0.12)] overflow-hidden`}
        >
          {locales.map((locale) => {
            const selected = locale === currentLocale;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => handleSelect(locale)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-[#F6F3EE] transition-colors ${
                  selected ? "text-[#7C2DE8] font-semibold" : "text-[#2B2B2B]"
                }`}
              >
                <span>{localeNames[locale]}</span>
                {selected && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
