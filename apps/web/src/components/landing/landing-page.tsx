"use client";

import { useState, useEffect } from "react";
import { GoalInput } from "./goal-input";
import { ExampleGoals } from "./example-goals";
import { AuthModal } from "./auth-modal";
import { createClient } from "@/lib/db/client";

export function LandingPage() {
  const [goalText, setGoalText] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setLoggedIn(true);
    });
  }, []);

  const handleSubmitGoal = (text: string) => {
    sessionStorage.setItem("pendingGoal", text);
    setAuthOpen(true);
  };

  const handleLogin = () => {
    setAuthOpen(true);
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
                  onClick={handleLogin}
                  className="text-[#6F6A64] hover:text-[#7FAEE6] transition-colors duration-200 active:scale-95 px-4 py-2"
                >
                  Login
                </button>
                <button
                  onClick={handleLogin}
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
              alt="YoBoss — Your AI team planning and executing together"
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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
