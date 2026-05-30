"use client";

import { useState, useTransition, useEffect } from "react";
import { ChevronLeft, Check, Zap, Building2, User2, Briefcase } from "lucide-react";
import { updateProfile } from "@/app/actions/profile";
import { createOrganization, createWorkspace } from "@/app/actions/organizations";
import { consumeInviteToken } from "@/app/actions/invites";

type Step = 1 | 2 | 3 | 4;

const ROLES = [
  "Event Coordinator",
  "Event Manager",
  "Marketing",
  "Operations",
  "Finance",
  "Volunteer Coordinator",
  "Project Manager",
  "Executive Director",
  "Other",
];

const STEPS = [
  { label: "Profile", icon: User2 },
  { label: "Role", icon: Briefcase },
  { label: "Workspace", icon: Building2 },
  { label: "Organization", icon: Building2 },
];

export default function OnboardingProfilePage() {
  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [pendingInviteOrg, setPendingInviteOrg] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("pending_invite_token");
    const orgLabel = localStorage.getItem("pending_invite_org");
    if (token) { setPendingInviteToken(token); setPendingInviteOrg(orgLabel); }
  }, []);

  // Auto-fill workspace name from first name when reaching step 3
  useEffect(() => {
    if (step === 3 && !workspaceName && fullName.trim()) {
      const firstName = fullName.trim().split(" ")[0];
      setWorkspaceName(`${firstName}'s Workspace`);
    }
  }, [step, fullName, workspaceName]);

  function handleBack() {
    setError(null);
    setStep((s) => (s - 1) as Step);
  }

  function handleContinue() {
    setError(null);
    if (step === 1 && !fullName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (step === 3 && !workspaceName.trim()) {
      setError("Please enter a workspace name.");
      return;
    }
    if (step < 4) {
      setStep((s) => (s + 1) as Step);
    } else {
      handleSubmit();
    }
  }

  function handleSubmit(createOrg = true) {
    startTransition(async () => {
      // 1. Save profile
      const fd = new FormData();
      fd.set("full_name", fullName.trim());
      roles.forEach((r) => fd.append("job_titles", r));
      const profileResult = await updateProfile(fd);
      if (profileResult?.error) {
        setError(profileResult.error);
        return;
      }

      // 2. Always create personal workspace
      const wsFd = new FormData();
      wsFd.set("name", workspaceName.trim());
      const wsResult = await createWorkspace(wsFd);
      if (wsResult?.error) {
        setError(wsResult.error);
        return;
      }

      // 3. If invite token: consume it instead of creating org
      if (pendingInviteToken) {
        localStorage.removeItem("pending_invite_token");
        localStorage.removeItem("pending_invite_org");
        const result = await consumeInviteToken(pendingInviteToken);
        window.location.href = result.data?.redirectPath ?? "/";
        return;
      }

      // 4. If org name provided and user chose to create an org
      if (createOrg && orgName.trim()) {
        const orgFd = new FormData();
        orgFd.set("name", orgName.trim());
        const orgResult = await (createOrganization as (fd: FormData) => Promise<{ error?: string; success?: boolean }>)(orgFd);
        if (orgResult?.error) {
          setError(orgResult.error);
          return;
        }
      }

      window.location.href = "/";
    });
  }

  const isLoading = isPending;

  return (
    <div className="min-h-screen bg-[#05050F] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-600/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => {
            const stepNum = (i + 1) as Step;
            const done = step > stepNum;
            const active = step === stepNum;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all ${
                  done ? "bg-indigo-500 text-white" :
                  active ? "bg-white/10 text-white ring-1 ring-indigo-500/50" :
                  "bg-white/[0.04] text-white/30"
                }`}>
                  {done ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${active ? "text-white" : done ? "text-white/50" : "text-white/25"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-px mx-1 ${done ? "bg-indigo-500/50" : "bg-white/[0.06]"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Invite notice */}
        {pendingInviteOrg && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
            <p className="text-sm text-indigo-300">
              You'll join <span className="font-semibold text-white">{pendingInviteOrg}</span> after setup
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
          {/* Back button */}
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {/* Step 1: Name */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">What's your name?</h2>
              <p className="text-sm text-white/40 mb-7">Teammates will see this on events, tasks, and comments.</p>
              <input
                type="text"
                placeholder="Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
                className="w-full h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white text-base placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>
          )}

          {/* Step 2: Role */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">What's your role?</h2>
              <p className="text-sm text-white/40 mb-7">Pick all that apply — you can change this later.</p>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setRoles((prev) =>
                        prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
                      )
                    }
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                      roles.includes(r)
                        ? "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300"
                        : "bg-white/[0.04] border border-white/[0.06] text-white/60 hover:bg-white/[0.07] hover:text-white/80"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Workspace (mandatory, no skip) */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Set up your workspace</h2>
              <p className="text-sm text-white/40 mb-7">
                Your personal space for events and tasks. You can join or create a team organization next.
              </p>
              <input
                type="text"
                placeholder="Jane's Workspace"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                autoFocus
                className="w-full h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white text-base placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
          )}

          {/* Step 4: Organization (optional) or invite token join */}
          {step === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                {pendingInviteToken ? "Almost there!" : "Create an organization"}
              </h2>
              <p className="text-sm text-white/40 mb-7">
                {pendingInviteToken
                  ? `You'll be added to ${pendingInviteOrg ?? "your team"}.`
                  : "Optional — create a team org to collaborate with others. You can do this later too."}
              </p>
              {!pendingInviteToken && (
                <input
                  type="text"
                  placeholder="Acme Events"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white text-base placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-7 flex items-center gap-3">
            <button
              onClick={handleContinue}
              disabled={isLoading}
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading
                ? "Saving..."
                : step < 3
                  ? "Continue →"
                  : step === 3
                    ? "Continue →"
                    : pendingInviteToken
                      ? "Join workspace →"
                      : orgName.trim()
                        ? "Create & continue →"
                        : "Continue →"}
            </button>
            {step === 2 && roles.length === 0 && (
              <button
                onClick={() => { setError(null); setRoles([]); setStep(3); }}
                className="text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                Skip
              </button>
            )}
            {step === 4 && !pendingInviteToken && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={isLoading}
                className="text-sm text-white/30 hover:text-white/50 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
