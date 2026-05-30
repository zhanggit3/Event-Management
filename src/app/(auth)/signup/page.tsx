"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles } from "lucide-react";

interface InviteContext {
  orgName: string;
  email: string;
}

function SignupForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [inviteContext, setInviteContext] = useState<InviteContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invite-context?token=${inviteToken}`)
      .then((r) => r.json())
      .then((data) => { if (data.orgName) setInviteContext(data); })
      .catch(() => {});
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const supabase = createClient();
    const { error: signupError } = await supabase.auth.signUp({ email, password });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (inviteToken) {
      localStorage.setItem("pending_invite_token", inviteToken);
      if (inviteContext?.orgName) {
        localStorage.setItem("pending_invite_org", inviteContext.orgName);
      }
    }

    window.location.href = "/onboarding/profile";
  }

  const emailValue = inviteContext?.email ?? "";
  const emailReadOnly = !!inviteContext?.email;

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Invite context banner */}
      {inviteContext && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-center">
          <p className="text-sm text-violet-300">
            Joining <span className="font-semibold text-white">{inviteContext.orgName}</span>
          </p>
        </div>
      )}

      {/* Card */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-1 tracking-tight">
          {inviteContext ? "Create account & join" : "Create your account"}
        </h1>
        <p className="text-sm text-white/40 text-center mb-7">
          {inviteContext
            ? `You'll be added to ${inviteContext.orgName} automatically.`
            : "Start managing your events with your team"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              defaultValue={emailValue}
              readOnly={emailReadOnly}
              className={`w-full h-11 px-4 rounded-xl border text-white text-sm focus:outline-none transition-all ${
                emailReadOnly
                  ? "bg-white/[0.03] border-white/[0.06] text-white/40 cursor-not-allowed"
                  : "bg-white/[0.06] border-white/10 placeholder:text-white/20 focus:border-violet-500/50 focus:bg-white/[0.08]"
              }`}
            />
            {emailReadOnly && (
              <p className="text-xs text-white/30 italic">
                Email is tied to your invite link.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.08] transition-all"
            />
            <p className="text-xs text-white/25">Minimum 8 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-purple-500 transition-all shadow-lg shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading
              ? "Creating account..."
              : inviteContext
              ? "Create account & join →"
              : "Create account →"}
          </button>
        </form>

        <p className="text-sm text-white/30 text-center mt-6">
          Already have an account?{" "}
          <Link
            href={inviteToken ? `/login?invite=${inviteToken}` : "/login"}
            className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 flex items-center justify-center min-h-[320px]">
          <p className="text-sm text-white/30">Loading...</p>
        </div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
