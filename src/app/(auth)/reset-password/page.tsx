"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DionyLogo } from "@/components/diony-logo";

// Methods that mean "a normal login session" — NOT a password recovery. A user
// who is simply signed in (password/oauth/etc.) must not be able to set a new
// password from this page; they should use the in-app Change Password flow.
const NON_RECOVERY_METHODS = new Set(["password", "oauth", "sso", "magiclink", "email"]);

/**
 * Inspect the session JWT's `amr` (authentication methods reference) to tell a
 * genuine recovery session apart from a normal login. Returns:
 *  - "recovery": came through the password-recovery link → allow.
 *  - "blocked":  a normal login session → deny (use Change Password instead).
 *  - "unknown":  can't determine → fail open (don't break the recovery flow).
 * NOTE: Supabase labels recovery sessions with amr method "recovery"; verify
 * against a live recovery token if this ever changes.
 */
function recoveryStatus(accessToken: string): "recovery" | "blocked" | "unknown" {
  try {
    const part = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as {
      amr?: { method: string; timestamp?: number }[];
    };
    const amr = payload.amr ?? [];
    if (amr.length === 0) return "unknown";
    const latest = [...amr].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
    if (latest?.method === "recovery" || latest?.method === "otp") return "recovery";
    if (latest && NON_RECOVERY_METHODS.has(latest.method)) return "blocked";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let recovered = false;

    // Additive signal: in flows where the client can detect the recovery hash,
    // the PASSWORD_RECOVERY event fires and confirms a genuine recovery session.
    // This app uses the SSR/PKCE flow (session established server-side by the
    // callback, no URL hash), so this event generally does NOT fire here — it's
    // purely supplementary. The getUser() check below is the primary gate.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovered = true;
        setInvalid(false);
        setReady(true);
      }
    });

    // Primary gate (works for the SSR/PKCE flow): the callback route has already
    // exchanged the recovery code for a session. We additionally require that the
    // session is a *recovery* session (via its amr) — a normal logged-in user must
    // not be able to change their password here (they use the Change Password flow).
    // Never override a ready state set by the recovery event.
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        if (!recovered) setInvalid(true);
        return;
      }
      if (recoveryStatus(token) === "blocked") {
        if (!recovered) setInvalid(true);
      } else {
        setReady(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      // Force a fresh login with the new password — kills the recovery session.
      // scope: "local" clears the session cookie client-side without depending on
      // a server round-trip; ignore any error so the redirect always proceeds
      // (the password is already updated server-side).
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        console.warn("Sign-out after password reset failed:", signOutError.message);
      }
      window.location.href = "/login?reset=success";
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong, please try again."
      );
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
          Set a new password
        </h1>
        <p className="text-sm text-white/40 text-center mb-7">
          Choose a new password for your account.
        </p>

        {invalid ? (
          <div className="space-y-6">
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center">
              This reset link is invalid or has expired.
            </div>
            <p className="text-sm text-white/30 text-center">
              <Link
                href="/forgot-password"
                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Request a new link
              </Link>
            </p>
          </div>
        ) : !ready ? (
          <div className="flex items-center justify-center min-h-[120px]">
            <p className="text-sm text-white/30">Loading...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm"
                className="block text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Confirm new password
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Updating..." : "Update password →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
