"use client";

import { useState } from "react";
import { Lock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Modal for the logged-in user to change their password. Requires the current
 * password (verified by re-authenticating) before setting a new one. Uses the
 * browser Supabase client directly, consistent with the login/signup/reset pages.
 */
export function ChangePasswordModal({
  email,
  open,
  onClose,
}: {
  email: string;
  open: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Capture the form node before any await — React clears currentTarget after.
    const form = e.currentTarget;
    const fd = new FormData(form);
    const current = fd.get("current") as string;
    const next = fd.get("next") as string;
    const confirm = fd.get("confirm") as string;

    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next === current) {
      setError("New password must be different from your current password.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Verify the current password by re-authenticating as the same user.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) {
        setError("Your current password is incorrect.");
        setLoading(false);
        return;
      }

      // Set the new password (session stays valid — no logout).
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      form.reset();
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, please try again.");
      setLoading(false);
    }
  }

  const inputClass =
    "w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#0D0D1C] border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Change your password</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-white/50 mb-4">
          You&apos;ll need your current password to confirm.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
              Password updated.
            </div>
          )}

          <input
            type="password"
            name="current"
            placeholder="Current password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
          <input
            type="password"
            name="next"
            placeholder="New password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <input
            type="password"
            name="confirm"
            placeholder="Confirm new password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
