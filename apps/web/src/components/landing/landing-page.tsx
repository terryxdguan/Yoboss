"use client";

import { useState, useEffect } from "react";
import {
  Check,
  X,
  AlertCircle,
  Flag,
  Calendar,
  Users,
  FileText,
  MessageCircle,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { GoalInput } from "./goal-input";
import { ExampleGoals } from "./example-goals";
import { AuthModal } from "./auth-modal";
import { LanguageSwitcher } from "@/components/common/language-switcher";
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
  const [goalText, setGoalText] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  // Tracks which mode the modal should open in — set BEFORE setAuthOpen(true)
  // so the modal's open-time reset effect picks up the right initial mode.
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
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

  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const handleSubmitGoal = (text: string) => {
    setPendingGoal(text);
    if (loggedIn) {
      // Already authenticated — skip the auth modal and drop them on
      // /dashboard. The onboarding-dashboard reads pendingGoal and
      // pre-fills its textarea with whatever they just typed.
      window.location.href = "/dashboard";
      return;
    }
    openAuth("signup");
  };

  const features: Array<{
    icon: typeof Flag;
    titleKey: string;
    bodyKey: string;
    color: string;
  }> = [
    { icon: Flag, titleKey: "feature1Title", bodyKey: "feature1Body", color: "#007AFF" },
    { icon: Calendar, titleKey: "feature2Title", bodyKey: "feature2Body", color: "#7FB38A" },
    { icon: Users, titleKey: "feature3Title", bodyKey: "feature3Body", color: "#C9A968" },
    { icon: FileText, titleKey: "feature4Title", bodyKey: "feature4Body", color: "#D5847A" },
    { icon: MessageCircle, titleKey: "feature5Title", bodyKey: "feature5Body", color: "#9B6B5C" },
    { icon: Wallet, titleKey: "feature6Title", bodyKey: "feature6Body", color: "#7FB3B3" },
  ];

  return (
    <div className="min-h-screen bg-[#F6F3EE] text-[#2B2B2B] selection:bg-[#E6F2FF] selection:text-[#007AFF]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#F6F3EE]/80 backdrop-blur-md">
        <div className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto font-medium tracking-tight">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-[#2B2B2B]">
              YoBoss
            </span>
            <div className="hidden md:flex items-center gap-6">
              <a
                className="text-[#6F6A64] hover:text-[#007AFF] transition-colors duration-200"
                href="#features"
              >
                {t("navFeatures")}
              </a>
              <a
                className="text-[#6F6A64] hover:text-[#007AFF] transition-colors duration-200"
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
                className="bg-[#007AFF] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#0066D6] active:scale-95 transition-all"
              >
                {t("ctaDashboard")}
              </a>
            ) : (
              <>
                <button
                  onClick={() => openAuth("login")}
                  className="text-[#6F6A64] hover:text-[#007AFF] transition-colors duration-200 active:scale-95 px-4 py-2"
                >
                  {t("ctaLogin")}
                </button>
                <button
                  onClick={() => openAuth("signup")}
                  className="bg-[#007AFF] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#0066D6] active:scale-95 transition-all"
                >
                  {t("ctaSignup")}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="-mt-2">
        <section className="max-w-4xl mx-auto px-6 text-center">
          {/* Hero illustration */}
          <div className="relative mx-auto max-w-2xl">
            <div className="overflow-hidden max-h-[280px] md:max-h-[340px]">
              <img
                src="/hero-illustration.png"
                alt={t("heroAlt")}
                className="w-full h-auto object-cover object-top"
              />
            </div>
            {/* Attribution badge — sits above the green (headphones)
                character. Positioned in % so it tracks the image as it
                scales down on narrower viewports. */}
            <span className="absolute right-[2%] top-[28%] z-20 inline-flex items-center rounded-full border border-[#007AFF]/40 bg-[#FFFDF9] px-2.5 py-1 text-[10px] md:text-xs font-medium text-[#5E8FCE] shadow-[0_2px_8px_rgba(0,122,255,0.18)] whitespace-nowrap">
              {t("heroBadge")}
            </span>
          </div>

          <p className="text-xl md:text-2xl text-[#2B2B2B] mb-4 max-w-4xl mx-auto whitespace-nowrap">
            {t("heroTagline")}
          </p>

          <GoalInput
            value={goalText}
            onChange={setGoalText}
            onSubmit={handleSubmitGoal}
          />

          <ExampleGoals onSelect={(text) => setGoalText(text)} />
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 mt-24 mb-20 scroll-mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#2B2B2B] mb-3">
              {t("featuresTitle")}
            </h2>
            <p className="text-base text-[#6F6A64] max-w-2xl mx-auto">
              {t("featuresSubtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, titleKey, bodyKey, color }) => (
              <div
                key={titleKey}
                className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 text-left hover:border-[#DDD3C7] hover:shadow-[0_8px_24px_rgba(30,34,39,0.06)] transition-all"
              >
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4"
                  style={{ backgroundColor: `${color}1F`, color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-[#2B2B2B] mb-1.5">{t(titleKey)}</h3>
                <p className="text-sm text-[#6F6A64] leading-relaxed">{t(bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-[#E7DED2] mt-14">
          <div className="flex items-center justify-between px-8 py-2 w-full max-w-7xl mx-auto">
            <span className="text-xs font-semibold text-[#2B2B2B]">YoBoss</span>
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

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSignupConfirmationSent={(email) => setSignupToastEmail(email)}
      />

      {authError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-6 right-6 z-[60] flex items-start gap-3 bg-[#FFFDF9] border border-[#D5847A]/40 rounded-lg shadow-[0_8px_24px_rgba(30,34,39,0.12)] p-4 max-w-md"
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
            className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors shrink-0"
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
          className="fixed top-6 right-6 z-[60] flex items-start gap-3 bg-[#FFFDF9] border border-[#7FB38A]/40 rounded-lg shadow-[0_8px_24px_rgba(30,34,39,0.12)] p-4 max-w-md"
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
            className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
