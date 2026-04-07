"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Check, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/db/client";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  checks: { label: string; passed: boolean }[];
}

function getPasswordStrength(password: string): PasswordStrength {
  const checks = [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "Contains uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "Contains lowercase letter", passed: /[a-z]/.test(password) },
    { label: "Contains number", passed: /[0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.passed).length;
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["#D5847A", "#D5847A", "#D4B06A", "#7FAEE6", "#7FB38A"];
  return { score, label: labels[score], color: colors[score], checks };
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    setError("");
    setSuccess("");
    setEmailError("");
  }, [mode]);

  if (!open) return null;

  const passwordStrength = getPasswordStrength(password);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateEmail = (value: string) => {
    setEmail(value);
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError("");
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
  };

  const canSubmitSignup =
    email && isValidEmail && !emailError && passwordStrength.score >= 2;

  const canSubmitLogin = email && password;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();

    if (mode === "signup") {
      if (!canSubmitSignup) {
        setLoading(false);
        return;
      }

      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard`,
        },
      });

      if (err) {
        if (err.message.includes("already registered")) {
          setError("This email is already registered. Try logging in instead.");
        } else {
          setError(err.message);
        }
      } else {
        setSuccess(
          "Check your email for a confirmation link! You can close this dialog."
        );
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (err) {
        if (err.message.includes("Invalid login credentials")) {
          setError("Wrong email or password. Please try again.");
        } else if (err.message.includes("Email not confirmed")) {
          setError(
            "Please confirm your email first. Check your inbox for the confirmation link."
          );
        } else {
          setError(err.message);
        }
      } else {
        window.location.href = "/dashboard";
        return;
      }
    }

    setLoading(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-[#FFFDF9] rounded-2xl shadow-[0_0_48px_rgba(30,34,39,0.12)] w-full max-w-md p-8 relative max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-md text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <h2 className="text-2xl font-bold text-[#2B2B2B] mb-1">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h2>
          <p className="text-sm text-[#6F6A64] mb-6">
            {mode === "signup"
              ? "Sign up to start achieving your goals"
              : "Log in to continue your progress"}
          </p>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-[#DDD3C7] rounded-lg px-4 py-3 text-sm font-medium text-[#2B2B2B] hover:bg-[#F6F3EE] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[#E7DED2]" />
            <span className="text-xs text-[#9B948B]">or</span>
            <div className="flex-1 h-px bg-[#E7DED2]" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm text-[#6F6A64] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => validateEmail(e.target.value)}
                className={`w-full border rounded-lg px-4 py-2.5 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:border-transparent bg-[#FFFDF9] ${
                  emailError
                    ? "border-[#D5847A] focus:ring-[#D5847A]/40"
                    : email && isValidEmail
                      ? "border-[#7FB38A] focus:ring-[#7FB38A]/40"
                      : "border-[#DDD3C7] focus:ring-[#7FAEE6]/40"
                }`}
                placeholder="you@example.com"
                required
              />
              {emailError && (
                <p className="text-xs text-[#D5847A] mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {emailError}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-[#6F6A64] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[#DDD3C7] rounded-lg px-4 py-2.5 pr-10 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/40 focus:border-transparent bg-[#FFFDF9]"
                  placeholder={
                    mode === "signup"
                      ? "Create a strong password"
                      : "Enter your password"
                  }
                  required
                  minLength={mode === "signup" ? 8 : 1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B948B] hover:text-[#6F6A64] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Password strength (signup only) */}
              {mode === "signup" && password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            i < passwordStrength.score
                              ? passwordStrength.color
                              : "#E7DED2",
                        }}
                      />
                    ))}
                  </div>
                  <p
                    className="text-xs font-medium"
                    style={{ color: passwordStrength.color }}
                  >
                    {passwordStrength.label}
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {passwordStrength.checks.map((check) => (
                      <p
                        key={check.label}
                        className={`text-xs flex items-center gap-1.5 ${
                          check.passed ? "text-[#7FB38A]" : "text-[#9B948B]"
                        }`}
                      >
                        {check.passed ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span className="h-3 w-3 inline-block rounded-full border border-[#DDD3C7]" />
                        )}
                        {check.label}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-[#D5847A]/5 rounded-lg">
                <AlertCircle className="h-4 w-4 text-[#D5847A] mt-0.5 shrink-0" />
                <p className="text-sm text-[#D5847A]">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 p-3 bg-[#7FB38A]/5 rounded-lg">
                <Check className="h-4 w-4 text-[#7FB38A] mt-0.5 shrink-0" />
                <p className="text-sm text-[#7FB38A]">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (mode === "signup" ? !canSubmitSignup : !canSubmitLogin)
              }
              className="w-full bg-[#7FAEE6] text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading
                ? mode === "signup"
                  ? "Creating account..."
                  : "Logging in..."
                : mode === "signup"
                  ? "Sign Up"
                  : "Log In"}
            </button>
          </form>

          <p className="text-sm text-[#6F6A64] text-center mt-6">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setMode("login")}
                  className="text-[#7FAEE6] font-medium hover:underline"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="text-[#7FAEE6] font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
