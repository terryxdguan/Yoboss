"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  X,
  AlertCircle,
  Flag,
  Users,
  FileText,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthModal } from "./auth-modal";
import { GetStartedModal } from "./get-started-modal";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { Wordmark, YMark } from "@/components/brand/wordmark";
import { createClient } from "@/lib/db/client";
import { setPendingGoal } from "@/lib/pending-goal";

function friendlyAuthError(
  error: string,
  description: string | null,
  t: (key: string) => string
): string {
  // Supabase is consistent about returning the original wording in
  // error_description. We special-case the most common paths so the
  // message reads naturally in the active locale.
  const desc = description || "";
  if (/expired/i.test(error) || /expired/i.test(desc)) {
    return t("authErrorExpired");
  }
  if (/access_denied/i.test(error) || /invalid|consumed|used/i.test(desc)) {
    return t("authErrorInvalid");
  }
  if (description) return description;
  return t("authErrorGeneric");
}

export function LandingPage() {
  const t = useTranslations("landing");
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  // Tracks which mode the modal should open in — set BEFORE setAuthOpen(true)
  // so the modal's open-time reset effect picks up the right initial mode.
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  // When the picker drives auth, we want post-auth to land on /goals so
  // the wizard can auto-start from the pendingGoal cookie. Nav-driven
  // auth leaves this undefined → AuthModal falls back to /dashboard.
  const [authNextPath, setAuthNextPath] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Holds the email of the just-signed-up user. Non-null = toast visible.
  const [signupToastEmail, setSignupToastEmail] = useState<string | null>(null);
  // Populated from ?error=... on mount — surfaces whatever Supabase sent
  // back through /auth/callback (expired link, invalid token, etc.).
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setLoggedIn(true);
    });
  }, []);

  // Pull any auth error out of the URL and clean up the address bar so
  // refreshes don't keep re-rendering the banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (!err) return;
    const description = params.get("error_description");
    const friendly = friendlyAuthError(err, description, t);
    setAuthError(friendly);
    params.delete("error");
    params.delete("error_code");
    params.delete("error_description");
    const cleaned =
      window.location.pathname +
      (params.toString() ? `?${params}` : "") +
      window.location.hash;
    window.history.replaceState(null, "", cleaned);
  }, [t]);

  // Auto-dismiss the signup toast after 8s. Owned by the parent because
  // the modal unmounts immediately on signup success.
  useEffect(() => {
    if (!signupToastEmail) return;
    const timer = setTimeout(() => setSignupToastEmail(null), 8000);
    return () => clearTimeout(timer);
  }, [signupToastEmail]);

  // Nav-button auth: keeps the original /dashboard destination so
  // returning users land where they expect.
  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthNextPath(undefined);
    setAuthOpen(true);
  };

  // Picker-driven submit: stash the goal in the pendingGoal cookie,
  // close the picker, and either push straight to /goals (logged-in)
  // or open AuthModal with nextPath="/goals" so the wizard auto-starts
  // immediately after sign-in.
  const handlePickerSubmit = (text: string) => {
    if (!text.trim()) return;
    setPendingGoal(text.trim());
    setPickerOpen(false);
    if (loggedIn) {
      router.push("/goals");
      return;
    }
    setAuthMode("signup");
    setAuthNextPath("/goals");
    setAuthOpen(true);
  };

  const features = [
    {
      number: "01",
      icon: Flag,
      eyebrowKey: "feature1Eyebrow" as const,
      titleKey: "feature1Title" as const,
      bodyKey: "feature1Body" as const,
      color: "#7C2DE8",
      iconBg: "#F3ECFB",
    },
    {
      number: "02",
      icon: Users,
      eyebrowKey: "feature2Eyebrow" as const,
      titleKey: "feature2Title" as const,
      bodyKey: "feature2Body" as const,
      color: "#7FB38A",
      iconBg: "#E6F2E8",
    },
    {
      number: "03",
      icon: FileText,
      eyebrowKey: "feature3Eyebrow" as const,
      titleKey: "feature3Title" as const,
      bodyKey: "feature3Body" as const,
      color: "#D5847A",
      iconBg: "#FBE6E3",
    },
  ];

  return (
    <div className="min-h-screen bg-[#FDFAF6] text-[#2B2B2B] selection:bg-[#F3ECFB] selection:text-[#7C2DE8]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#FDFAF6]/85 backdrop-blur-md">
        <div className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto font-medium tracking-tight">
          <div className="flex items-center gap-8">
            <a href="/" aria-label="YoBoss home" className="shrink-0">
              <Wordmark className="h-7" />
            </a>
            <div className="hidden md:flex items-center gap-6">
              <a
                className="text-[#6F6A64] hover:text-[#7C2DE8] transition-colors duration-200"
                href="#features"
              >
                {t("navFeatures")}
              </a>
              <a
                className="text-[#6F6A64] hover:text-[#7C2DE8] transition-colors duration-200"
                href="/pricing"
              >
                {t("navPricing")}
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            {loggedIn ? (
              <a
                href="/dashboard"
                className="bg-[#7C2DE8] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-[#6921C7] active:scale-95 transition-all shadow-brand"
              >
                {t("ctaDashboard")}
              </a>
            ) : (
              <>
                <button
                  onClick={() => openAuth("login")}
                  className="text-[#6F6A64] hover:text-[#7C2DE8] transition-colors duration-200 active:scale-95 px-4 py-2"
                >
                  {t("ctaLogin")}
                </button>
                <button
                  onClick={() => openAuth("signup")}
                  className="bg-[#7C2DE8] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-[#6921C7] active:scale-95 transition-all shadow-brand"
                >
                  {t("ctaSignup")}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        {/* Hero — 2 column */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-28 lg:pt-32 pb-16 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-center">
            {/* Left column — headline + CTA */}
            <div>
              <h1 className="font-display text-[44px] md:text-[64px] lg:text-[72px] font-bold leading-[0.98] tracking-[-0.025em] text-[#1A1829]">
                {t("heroLine1")}
                <br />
                {t("heroLine2")}
                <br />
                <span className="text-[#7C2DE8]">{t("heroLine3")}</span>
              </h1>
              <p className="mt-6 max-w-md text-base md:text-lg text-[#1A1829] leading-relaxed">
                {t("heroPromise")}
              </p>
              <p className="mt-3 max-w-md text-sm text-[#9B948B] leading-relaxed">
                {t("heroPromiseI18n")}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#7C2DE8] text-white px-7 py-3.5 rounded-xl text-base font-semibold hover:bg-[#6921C7] active:scale-95 transition-all shadow-brand"
                >
                  {t("ctaSetGoal")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Social proof — avatar stack + count */}
              <div className="mt-8 flex items-center gap-3">
                <div className="flex -space-x-2">
                  <span
                    className="h-7 w-7 rounded-full ring-2 ring-[#FDFAF6]"
                    style={{ backgroundColor: "#7C2DE8" }}
                    aria-hidden="true"
                  />
                  <span
                    className="h-7 w-7 rounded-full ring-2 ring-[#FDFAF6]"
                    style={{ backgroundColor: "#007AFF" }}
                    aria-hidden="true"
                  />
                  <span
                    className="h-7 w-7 rounded-full ring-2 ring-[#FDFAF6]"
                    style={{ backgroundColor: "#7FB38A" }}
                    aria-hidden="true"
                  />
                  <span
                    className="h-7 w-7 rounded-full ring-2 ring-[#FDFAF6]"
                    style={{ backgroundColor: "#D5847A" }}
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm text-[#6F6A64]">
                  <span className="font-semibold text-[#1A1829]">4,812</span>{" "}
                  {t("heroSocialProof")}
                </p>
              </div>
            </div>

            {/* Right column — ink roadmap-preview card + overlapping team mini-card */}
            <div className="relative">
              <div className="relative overflow-hidden rounded-2xl bg-[#1A1829] text-[#FDFAF6] p-6 md:p-7 shadow-[0_24px_60px_rgba(26,24,41,0.25)]">
                {/* Header row */}
                <div className="flex items-center justify-between mb-5">
                  <span
                    className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ backgroundColor: "rgba(124,45,232,0.22)", color: "#C9A8F7" }}
                  >
                    {t("heroCardEyebrow")}
                  </span>
                  <span className="font-mono text-[11px] tracking-[0.04em] text-[#FDFAF6]/55">
                    {t("heroCardWeeks")}
                  </span>
                </div>

                <h2 className="font-display text-xl md:text-2xl font-bold leading-tight tracking-[-0.018em] mb-6">
                  {t("heroCardTitle")}
                </h2>

                {/* Phases */}
                <ul className="space-y-2.5">
                  {[
                    { num: 1, state: "done", title: "Define voice & 25 starter readers", weeks: "w1–2" },
                    { num: 2, state: "active", title: "Editorial cadence + landing page", weeks: "w3–5" },
                    { num: 3, state: "next", title: "Pricing tests, paid tier opens", weeks: "w6–9" },
                    { num: 4, state: "next", title: "Sponsorship outreach, 500 paid", weeks: "w10–12" },
                  ].map((p) => (
                    <li
                      key={p.num}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                        p.state === "active"
                          ? "bg-[rgba(124,45,232,0.18)] ring-1 ring-[#7C2DE8]/40"
                          : ""
                      }`}
                    >
                      {/* Node */}
                      {p.state === "done" ? (
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C2DE8]">
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                        </span>
                      ) : p.state === "active" ? (
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1829] ring-2 ring-[#7C2DE8] shadow-[0_0_0_4px_rgba(124,45,232,0.18)]">
                          <span className="block h-2 w-2 rounded-full bg-[#7C2DE8]" />
                        </span>
                      ) : (
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1829] ring-2 ring-[#FDFAF6]/20 text-[10px] font-bold text-[#FDFAF6]/45">
                          {p.num}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#FDFAF6]/45">
                          PHASE {p.num}
                        </p>
                        <p className="text-sm font-medium text-[#FDFAF6] truncate">
                          {p.title}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] tracking-[0.04em] text-[#FDFAF6]/45 shrink-0">
                        {p.weeks}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Team mini-card — overlaps bottom-right of ink card */}
              <div className="hidden md:block absolute right-3 -bottom-6 w-[200px] rounded-xl bg-white border border-[#E7DED2] p-3.5 shadow-[0_12px_32px_rgba(26,24,41,0.10)]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#9B948B]">
                    {t("heroTeamEyebrow")}
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]"
                    style={{ backgroundColor: "#E6F2E8", color: "#3F7A4C" }}
                  >
                    3 SHIPPED
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {[
                    { letter: "M", name: "Mara", role: "Editor", color: "#7C2DE8" },
                    { letter: "L", name: "Lin", role: "Designer", color: "#007AFF" },
                    { letter: "S", name: "Sol", role: "Growth", color: "#D5847A" },
                  ].map((m) => (
                    <li key={m.name} className="flex items-center gap-2">
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.letter}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-[#1A1829]">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-[#9B948B] ml-1.5">
                          {m.role}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* "One goal in." section — eyebrow heading + 3 cards */}
        <section id="features" className="max-w-7xl mx-auto px-6 lg:px-10 pt-8 lg:pt-12 pb-20 scroll-mt-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.6fr] gap-6 lg:gap-12 items-end mb-10">
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-[-0.022em] leading-[1.05] text-[#1A1829]">
              {t("featuresTitleA")}
              <br />
              {t("featuresTitleB")}
            </h2>
            <p className="text-sm md:text-base text-[#6F6A64] leading-relaxed lg:pb-2">
              {t("featuresSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map(({ number, icon: Icon, eyebrowKey, titleKey, bodyKey, color, iconBg }) => (
              <div
                key={number}
                className="flex h-full flex-col rounded-2xl border border-[#E7DED2] bg-white p-6 transition-all hover:border-[#DDD3C7] hover:shadow-[0_10px_28px_rgba(26,24,41,0.06)]"
              >
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-5"
                  style={{ backgroundColor: iconBg, color: color }}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B948B] mb-2.5">
                  {number} / {t(eyebrowKey)}
                </p>
                <h3 className="font-display text-lg md:text-xl font-bold leading-snug tracking-[-0.015em] text-[#1A1829] mb-3">
                  {t(titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-[#6F6A64]">
                  {t(bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Ink final-CTA — single CTA, brand glow, decorative Y-mark watermark */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 mb-20">
          <div className="relative overflow-hidden rounded-3xl bg-[#1A1829] text-[#FDFAF6] px-8 md:px-14 py-12 md:py-16">
            <YMark
              tone="violet"
              fadeOpacity={0.4}
              className="absolute right-0 top-0 h-48 w-auto md:h-72 opacity-[0.18] translate-x-6 -translate-y-2"
            />
            <div className="relative max-w-2xl">
              <span className="inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-[#FDFAF6]/55 mb-4">
                {t("inkCtaEyebrow")}
              </span>
              <h2 className="font-display text-3xl md:text-5xl font-bold tracking-[-0.022em] leading-[1.05]">
                {t("inkCtaTitleA")}
                <br />
                <span className="text-[#C9A8F7]">{t("inkCtaTitleB")}</span>
              </h2>
              <p className="mt-5 max-w-lg text-[#FDFAF6]/70 text-base leading-relaxed">
                {t("inkCtaBody")}
              </p>
              <div className="mt-7">
                <button
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#7C2DE8] text-white px-7 py-3.5 rounded-xl text-base font-semibold hover:bg-[#6921C7] active:scale-95 transition-all shadow-brand"
                >
                  {t("ctaSetGoal")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-[#E7DED2]">
          <div className="flex items-center justify-between px-8 py-4 w-full max-w-7xl mx-auto">
            <a href="/" aria-label="YoBoss home">
              <Wordmark className="h-5" />
            </a>
            <div className="flex items-center gap-6">
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="#features">{t("navFeatures")}</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="/pricing">{t("navPricing")}</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="/privacy">{t("footerPrivacy")}</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="/terms">{t("footerTerms")}</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="mailto:contact@mail.yoboss.ai">{t("footerContact")}</a>
            </div>
            <span className="text-xs text-[#9B948B]">{t("footerCopyright")}</span>
          </div>
        </footer>
      </main>

      <GetStartedModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSubmit={handlePickerSubmit}
      />

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        nextPath={authNextPath}
        onClose={() => setAuthOpen(false)}
        onSignupConfirmationSent={(email) => setSignupToastEmail(email)}
      />

      {authError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-6 right-6 z-[60] flex items-start gap-3 bg-[#FFFFFF] border border-[#D5847A]/40 rounded-lg shadow-[0_8px_24px_rgba(30,34,39,0.12)] p-4 max-w-md"
        >
          <AlertCircle className="h-5 w-5 text-[#D5847A] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#2B2B2B] mb-0.5">
              {t("authErrorTitle")}
            </p>
            <p className="text-sm text-[#6F6A64]">{authError}</p>
          </div>
          <button
            onClick={() => setAuthError(null)}
            className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F6F3EE] transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {signupToastEmail && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-6 right-6 z-[60] flex items-start gap-3 bg-[#FFFFFF] border border-[#7FB38A]/40 rounded-lg shadow-[0_8px_24px_rgba(30,34,39,0.12)] p-4 max-w-md"
        >
          <Check className="h-5 w-5 text-[#7FB38A] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#2B2B2B] mb-0.5">
              {t("signupToastTitle")}
            </p>
            <p className="text-sm text-[#6F6A64] break-all">
              {t("signupToastBody", { email: signupToastEmail })}
            </p>
          </div>
          <button
            onClick={() => setSignupToastEmail(null)}
            className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F6F3EE] transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
