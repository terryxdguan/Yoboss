"use client";

import { useState, useEffect } from "react";
import { GoalInput } from "./goal-input";
import { ExampleGoals } from "./example-goals";
import { AuthModal } from "./auth-modal";
import { createClient } from "@/lib/db/client";

export function LandingPage() {
  const [goalText, setGoalText] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        window.location.href = "/dashboard";
      }
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
    <div className="min-h-screen bg-[#F7F5F1] text-[#1E2227] selection:bg-[#EAF0FF] selection:text-[#4C7CF0]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#F7F5F1]/80 backdrop-blur-md">
        <div className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto font-medium tracking-tight">
          <div className="flex items-center gap-8">
            <span className="text-xl font-bold tracking-tighter text-[#1E2227]">
              YoBoss
            </span>
            <div className="hidden md:flex items-center gap-6">
              <a
                className="text-[#626A73] hover:text-[#4C7CF0] transition-colors duration-200"
                href="#"
              >
                Product
              </a>
              <a
                className="text-[#626A73] hover:text-[#4C7CF0] transition-colors duration-200"
                href="#"
              >
                Features
              </a>
              <a
                className="text-[#626A73] hover:text-[#4C7CF0] transition-colors duration-200"
                href="#"
              >
                Pricing
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleLogin}
              className="text-[#626A73] hover:text-[#4C7CF0] transition-colors duration-200 active:scale-95 px-4 py-2"
            >
              Login
            </button>
            <button
              onClick={handleLogin}
              className="bg-[#4C7CF0] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[#3F6FE4] active:scale-95 transition-all"
            >
              Sign Up
            </button>
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

          <p className="text-xl md:text-2xl text-[#1E2227] mb-4 max-w-4xl mx-auto whitespace-nowrap">
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
        <footer className="w-full border-t border-[#E6E1D8] bg-[#F1EEE8]">
          <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 w-full max-w-7xl mx-auto">
            <div className="mb-8 md:mb-0">
              <span className="text-lg font-bold text-[#1E2227]">YoBoss</span>
              <p className="text-sm text-[#626A73] mt-2 max-w-xs">
                Build intentional habits and reach your peak performance with
                AI-driven planning.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-12 mb-8 md:mb-0">
              <div className="flex flex-col gap-4">
                <span className="text-sm tracking-wide uppercase font-bold text-[#1E2227]">
                  Product
                </span>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Features
                </a>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Integrations
                </a>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Pricing
                </a>
              </div>
              <div className="flex flex-col gap-4">
                <span className="text-sm tracking-wide uppercase font-bold text-[#1E2227]">
                  Company
                </span>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  About Us
                </a>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Blog
                </a>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Contact
                </a>
              </div>
              <div className="flex flex-col gap-4">
                <span className="text-sm tracking-wide uppercase font-bold text-[#1E2227]">
                  Legal
                </span>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Privacy Policy
                </a>
                <a className="text-sm text-[#626A73] hover:underline" href="#">
                  Terms of Service
                </a>
              </div>
            </div>
            <div className="text-sm text-[#626A73]">
              &copy; 2025 YoBoss. All rights reserved.
            </div>
          </div>
        </footer>
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
