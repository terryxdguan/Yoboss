"use client";

import { useState, useEffect } from "react";
import { Check, X, AlertCircle } from "lucide-react";
import { GoalInput } from "./goal-input";
import { ExampleGoals } from "./example-goals";
import { AuthModal } from "./auth-modal";
import { createClient } from "@/lib/db/client";
import { setPendingGoal } from "@/lib/pending-goal";

function friendlyAuthError(error: string, description: string | null): string {
  // Supabase is consistent about returning the original wording in
  // error_description. We only special-case the most common paths so the
  // message reads like English instead of debug output.
  const desc = description || "";
  if (/expired/i.test(error) || /expired/i.test(desc)) {
    return "Your confirmation link has expired. Sign up again to receive a fresh link.";
  }
  if (/access_denied/i.test(error) || /invalid|consumed|used/i.test(desc)) {
    return "That confirmation link is no longer valid. Sign up again to receive a fresh link.";
  }
  if (description) return description;
  return "Something went wrong while signing you in. Please try again.";
}

export function LandingPage() {
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
    const friendly = friendlyAuthError(err, description);
    setAuthError(friendly);
    params.delete("error");
    params.delete("error_code");
    params.delete("error_description");
    const cleaned =
      window.location.pathname +
      (params.toString() ? `?${params}` : "") +
      window.location.hash;
    window.history.replaceState(null, "", cleaned);
  }, []);

  // Auto-dismiss the signup toast after 8s. Owned by the parent because
  // the modal unmounts immediately on signup success.
  useEffect(() => {
    if (!signupToastEmail) return;
    const t = setTimeout(() => setSignupToastEmail(null), 8000);
    return () => clearTimeout(t);
  }, [signupToastEmail]);

  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const handleSubmitGoal = (text: string) => {
    setPendingGoal(text);
    if (loggedIn) {
      // Already authenticated — no need for the auth modal; drop them
      // straight into the goal-creation flow and let /goals/create
      // consume pendingGoal on mount.
      window.location.href = "/goals/create";
      return;
    }
    openAuth("signup");
  };

  return (
    <div className="min-h-screen bg-[#F6F3EE] text-[#2B2B2B] selection:bg-[#EAF3FD] selection:text-[#7FAEE6]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#F6F3EE]/80 backdrop-blur-md">
        <div className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto font-medium tracking-tight">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-[#2B2B2B]">
              YoBoss
            </span>
            <div className="hidden md:flex items-center gap-6">
              <a
                className="text-[#6F6A64] hover:text-[#7FAEE6] transition-colors duration-200"
                href="#"
              >
                Product
              </a>
              <a
                className="text-[#6F6A64] hover:text-[#7FAEE6] transition-colors duration-200"
                href="#"
              >
                Features
              </a>
              <a
                className="text-[#6F6A64] hover:text-[#7FAEE6] transition-colors duration-200"
                href="#"
              >
                Pricing
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {loggedIn ? (
              <a
                href="/dashboard"
                className="bg-[#7FAEE6] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#6A9DDA] active:scale-95 transition-all"
              >
                Dashboard
              </a>
            ) : (
              <>
                <button
                  onClick={() => openAuth("login")}
                  className="text-[#6F6A64] hover:text-[#7FAEE6] transition-colors duration-200 active:scale-95 px-4 py-2"
                >
                  Login
                </button>
                <button
                  onClick={() => openAuth("signup")}
                  className="bg-[#7FAEE6] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#6A9DDA] active:scale-95 transition-all"
                >
                  Sign Up
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
          <div className="overflow-hidden max-h-[280px] md:max-h-[340px]">
            <img
              src="/hero-illustration.png"
              alt="YoBoss — Your team planning and executing together"
              className="mx-auto max-w-2xl w-full h-auto object-cover object-top"
            />
          </div>

          <p className="text-xl md:text-2xl text-[#2B2B2B] mb-4 max-w-4xl mx-auto whitespace-nowrap">
            Describe your goal and your digital employees plan &amp; execute
          </p>

          <GoalInput
            value={goalText}
            onChange={setGoalText}
            onSubmit={handleSubmitGoal}
          />

          <ExampleGoals onSelect={(text) => setGoalText(text)} />
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-[#E7DED2] mt-14">
          <div className="flex items-center justify-between px-8 py-2 w-full max-w-7xl mx-auto">
            <span className="text-xs font-semibold text-[#2B2B2B]">YoBoss</span>
            <div className="flex items-center gap-6">
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="#">Features</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="#">Pricing</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="#">Privacy</a>
              <a className="text-xs text-[#9B948B] hover:text-[#6F6A64] hover:underline" href="#">Terms</a>
            </div>
            <span className="text-xs text-[#9B948B]">&copy; 2026 YoBoss</span>
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
              Sign-in didn&apos;t go through
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
              Check your email
            </p>
            <p className="text-sm text-[#6F6A64] break-all">
              We sent a confirmation link to {signupToastEmail}.
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
