"use client";

import { useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { createOrganization } from "@/app/actions/organizations";

export function NoOrgPrompt() {
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", orgName.trim());
      const result = await (createOrganization as (fd: FormData) => Promise<{ error?: string; success?: boolean }>)(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      window.location.href = "/";
    });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-white text-center mb-2">
          You don&apos;t have a workspace yet.
        </h2>
        <p className="text-sm text-white/40 text-center mb-8">
          Create one to start managing events with your team.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            placeholder="Organization name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="flex-1 h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all"
          />
          <button
            type="submit"
            disabled={isPending || !orgName.trim()}
            className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isPending ? "Creating..." : "Create workspace →"}
          </button>
        </form>

        {error && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
