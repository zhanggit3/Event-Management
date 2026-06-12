"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DionyLogo } from "@/components/diony-logo";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const supabase = createClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      // Intentionally ignore the returned error to avoid account enumeration —
      // we always show the same confirmation state below.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/api/auth/callback?next=/reset-password`,
      });
      setSent(true);
      setLoading(false);
    } catch {
      setError("Something went wrong, please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Card */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <DionyLogo className="w-5 h-5 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-1 tracking-tight">
          Reset your password
        </h1>
        <p className="text-sm text-white/40 text-center mb-7">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {sent ? (
          <div className="space-y-6">
            <div className="px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-sm text-indigo-300 text-center">
              If an account exists for that email, we&apos;ve sent a reset link.
              Check your inbox.
            </div>
            <p className="text-sm text-white/30 text-center">
              <Link
                href="/login"
                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-white/50 uppercase tracking-wider"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Sending..." : "Send reset link →"}
              </button>
            </form>

            <p className="text-sm text-white/30 text-center mt-6">
              Remember your password?{" "}
              <Link
                href="/login"
                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
