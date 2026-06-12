"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { consumeInviteToken } from "@/app/actions/invites";
import { DionyLogo } from "@/components/diony-logo";

function LoginForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const resetSuccess = searchParams.get("reset") === "success";

  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invite-context?token=${inviteToken}`)
      .then((r) => r.json())
      .then((data) => { if (data.orgName) setInviteOrgName(data.orgName); })
      .catch(() => {});
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        formRef.current?.reset();
        setError("The email or password is incorrect, please try again.");
        setLoading(false);
        return;
      }

      let redirectPath = "/";
      if (inviteToken) {
        const result = await consumeInviteToken(inviteToken);
        if (result.error) {
          setError(result.error);
          setLoading(false);
          return;
        }
        if (result.data?.redirectPath) redirectPath = result.data.redirectPath;
      }

      window.location.href = redirectPath;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Invite context banner */}
      {inviteOrgName && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
          <p className="text-sm text-indigo-300">
            Sign in to join <span className="font-semibold text-white">{inviteOrgName}</span>
          </p>
        </div>
      )}

      {/* Card */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <DionyLogo className="w-5 h-5 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-1 tracking-tight">
          {inviteOrgName ? "Sign in & join" : "Welcome back"}
        </h1>
        <p className="text-sm text-white/40 text-center mb-7">
          {inviteOrgName
            ? `You'll be added to ${inviteOrgName} after signing in.`
            : "Sign in to your event management workspace"}
        </p>

        {resetSuccess && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300 text-center">
            Password updated — sign in with your new password.
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading
              ? "Signing in..."
              : inviteOrgName
              ? "Sign in & join →"
              : "Sign in →"}
          </button>
        </form>

        <p className="text-sm text-white/30 text-center mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href={inviteToken ? `/signup?invite=${inviteToken}` : "/signup"}
            className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 flex items-center justify-center min-h-[320px]">
          <p className="text-sm text-white/30">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
