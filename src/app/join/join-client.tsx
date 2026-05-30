"use client";

import { useState, useEffect, useTransition } from "react";
import { Search, Ban, CheckCircle2 } from "lucide-react";
import { searchOrganizations, submitJoinRequest } from "@/app/actions/join-requests";
import { formatDate } from "@/lib/utils";

const MAX_PENDING = 5;

interface OrgResult {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  userRequest: { status: string; created_at: string } | null;
  isBlocked: boolean;
}

interface RequestRow {
  id: string;
  organization_id: string;
  status: string;
  created_at: string;
  organization: { id: string; name: string; slug: string };
}

interface Props {
  initialQuery: string;
  pendingCount: number;
  allRequests: RequestRow[];
}

type View = "search" | "confirmation" | "hardlimit";

export function JoinPageClient({ initialQuery, pendingCount: initialPending, allRequests: initialRequests }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<OrgResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingCount, setPendingCount] = useState(initialPending);
  const [allRequests, setAllRequests] = useState(initialRequests);
  const [view, setView] = useState<View>(initialPending >= MAX_PENDING ? "hardlimit" : "search");
  const [lastRequested, setLastRequested] = useState<OrgResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Search on query change
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await searchOrganizations(query.trim());
      setResults(res.data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function handleRequest(org: OrgResult) {
    if (pendingCount >= MAX_PENDING) {
      setView("hardlimit");
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await submitJoinRequest(org.id);
      if (result.error) {
        setActionError(result.error);
      } else {
        // Update local state
        setLastRequested(org);
        setPendingCount((p) => p + 1);
        setResults((prev) =>
          prev.map((r) =>
            r.id === org.id
              ? { ...r, userRequest: { status: "pending", created_at: new Date().toISOString() } }
              : r
          )
        );
        setAllRequests((prev) => [
          {
            id: result.data!.id,
            organization_id: org.id,
            status: "pending",
            created_at: new Date().toISOString(),
            organization: { id: org.id, name: org.name, slug: org.slug },
          },
          ...prev,
        ]);
        const newPending = pendingCount + 1;
        if (newPending >= MAX_PENDING) {
          setView("hardlimit");
        } else {
          setView("confirmation");
        }
      }
    });
  }

  const slotsUsed = pendingCount;
  const slotsOpen = Math.max(0, MAX_PENDING - slotsUsed);
  const atLimit = slotsUsed >= MAX_PENDING;

  if (view === "hardlimit") {
    return <HardLimitView allRequests={allRequests} onBack={() => setView("search")} />;
  }

  if (view === "confirmation" && lastRequested) {
    return (
      <ConfirmationView
        org={lastRequested}
        pendingCount={pendingCount}
        onSendAnother={() => setView("search")}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Find an Organization</h1>
        <p className="text-sm text-white/40">All public organizations are searchable.</p>
      </div>

      {/* Request slot counter */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 mb-6">
        <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-3">Open Request Slots</p>
        <div className="flex items-end gap-2 mb-3">
          <span className={`text-xl font-bold font-mono ${atLimit ? "text-red-400" : "text-orange-400"}`}>
            {slotsUsed} / {MAX_PENDING}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${atLimit ? "bg-red-500" : "bg-orange-500"}`}
            style={{ width: `${(slotsUsed / MAX_PENDING) * 100}%` }}
          />
        </div>
        <p className="text-xs text-white/30">
          {slotsUsed} active pending · {slotsOpen} slot{slotsOpen !== 1 ? "s" : ""} open
        </p>
        <p className="text-xs text-white/20 italic mt-0.5">
          Approved or denied requests free up a slot.
        </p>
      </div>

      {atLimit ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="font-semibold text-red-400 text-sm mb-1">Request Limit Reached</p>
          <p className="text-sm text-white/40">
            You have 5 pending requests. Wait for one to be resolved before sending more.
          </p>
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search organizations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex h-11 w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.06] transition-colors"
            />
          </div>

          {actionError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-sm mb-4">
              {actionError}
            </div>
          )}

          {/* Results */}
          {searching && (
            <p className="text-sm font-mono text-white/30 py-4">Searching...</p>
          )}

          {!searching && query && results.length === 0 && (
            <p className="text-sm font-mono text-white/30 py-4">No organizations found for &quot;{query}&quot;</p>
          )}

          <div className="space-y-3">
            {results.map((org) => (
              <OrgResultCard
                key={org.id}
                org={org}
                atLimit={atLimit}
                onRequest={handleRequest}
                isPending={isPending}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrgResultCard({
  org,
  atLimit,
  onRequest,
  isPending,
}: {
  org: OrgResult;
  atLimit: boolean;
  onRequest: (org: OrgResult) => void;
  isPending: boolean;
}) {
  if (org.isBlocked) {
    return (
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm text-white/20">{org.name}</p>
            <p className="text-xs font-mono text-white/20 mt-0.5">{org.member_count} members</p>
          </div>
          <span className="text-xs font-mono text-white/20 uppercase">Blocked — Contact Org Directly</span>
        </div>
      </div>
    );
  }

  const hasPendingRequest = org.userRequest?.status === "pending";
  const hadDenied = org.userRequest?.status === "denied";

  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 hover:bg-white/[0.06] transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-sm text-white">{org.name}</p>
            <span className="rounded-full border border-white/[0.12] text-xs font-mono px-2 py-0.5 text-white/40 uppercase">Public</span>
          </div>
          <p className="text-xs font-mono text-white/30">{org.member_count} member{org.member_count !== 1 ? "s" : ""}</p>
          {hasPendingRequest && org.userRequest && (
            <p className="text-xs font-mono text-white/30 mt-1">
              Pending since {formatDate(org.userRequest.created_at)}
            </p>
          )}
          {hadDenied && (
            <p className="text-xs font-mono text-white/30 mt-1">Previous request was denied</p>
          )}
        </div>
        <div>
          {hasPendingRequest ? (
            <span className="text-xs font-mono text-orange-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Requested
            </span>
          ) : (
            <button
              onClick={() => onRequest(org)}
              disabled={atLimit || isPending}
              className="h-8 px-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Request Access →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmationView({
  org,
  pendingCount,
  onSendAnother,
}: {
  org: OrgResult;
  pendingCount: number;
  onSendAnother: () => void;
}) {
  const atWarning = pendingCount === MAX_PENDING - 1;
  const atLimit = pendingCount >= MAX_PENDING;

  return (
    <div className="max-w-md mx-auto w-full">
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-orange-500/20 blur-md" />
            <CheckCircle2 className="relative w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">Request Sent</h1>
        <p className="text-center text-sm text-white/50 mb-6">
          Your request to join {org.name} is pending review.
        </p>

        {/* Org context */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4">
          <p className="font-semibold text-white text-sm">{org.name}</p>
          <p className="text-xs font-mono text-white/30 mt-0.5">{org.member_count} members</p>
        </div>

        {/* What happens next */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
          <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">What Happens Next</p>
          <ol className="space-y-2.5">
            {[
              "An admin gets an email notification",
              "They approve or deny your request in Settings",
              "You get notified of the decision",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-white/60">
                <span className="font-mono font-bold text-orange-400/70 shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Warning at 4/5 */}
        {atWarning && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-4">
            <p className="font-semibold text-orange-400 text-sm mb-1">1 Request Slot Remaining</p>
            <p className="text-sm text-white/40">
              You have used 4 of 5 request slots. Your next request will be your last until one resolves.
            </p>
          </div>
        )}

        {!atLimit && (
          <button
            onClick={onSendAnother}
            className="w-full h-11 bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] rounded-xl font-semibold text-white text-sm tracking-wide transition-all"
          >
            Send Another Request →
          </button>
        )}
      </div>
    </div>
  );
}

function HardLimitView({
  allRequests,
  onBack,
}: {
  allRequests: RequestRow[];
  onBack: () => void;
}) {
  const statusIcon: Record<string, string> = {
    pending: "●",
    denied: "✕",
    blocked: "⊘",
    approved: "✓",
  };
  const statusColor: Record<string, string> = {
    pending: "text-orange-400",
    denied: "text-red-400",
    blocked: "text-red-400",
    approved: "text-emerald-400",
  };

  return (
    <div className="max-w-md mx-auto w-full">
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-red-500/20 blur-md" />
            <Ban className="relative w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">5 Requests Pending</h1>
        <p className="text-center text-sm text-white/50 mb-6">
          You&apos;ve reached the maximum number of pending requests.
        </p>

        {/* Slot counter */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
          <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Open Request Slots</p>
          <p className="text-xl font-bold font-mono text-red-400 mb-3">0 / 5</p>
          <div className="h-1.5 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
            <div className="h-full rounded-full bg-red-500 w-full" />
          </div>
          <p className="text-xs text-white/30">
            Once an org approves or denies your request, a slot opens up.
          </p>
        </div>

        {/* Request history */}
        {allRequests.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-3">Your Requests</p>
            <div className="space-y-1">
              {allRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-3 text-sm py-2 border-b border-white/[0.05] last:border-0"
                >
                  <span className={`font-mono font-bold text-xs ${statusColor[req.status] ?? "text-white/30"}`}>
                    {statusIcon[req.status] ?? "?"}
                  </span>
                  <span className="flex-1 text-white/70 font-medium">{req.organization?.name ?? req.organization_id}</span>
                  <span className="text-xs font-mono text-white/25">{formatDate(req.created_at)}</span>
                  {req.status !== "pending" && (
                    <span className="text-xs font-mono text-emerald-400/70">Slot freed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onBack}
          className="w-full h-11 bg-white/[0.06] border border-white/10 hover:bg-white/[0.09] rounded-xl font-semibold text-white text-sm tracking-wide transition-all"
        >
          ← Back to Search
        </button>
      </div>
    </div>
  );
}
