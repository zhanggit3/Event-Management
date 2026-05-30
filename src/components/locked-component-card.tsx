"use client";

import { useState, useTransition } from "react";
import { Lock, Clock, Send } from "lucide-react";
import { requestComponentAccess, cancelComponentAccessRequest } from "@/app/actions/component-access-requests";

interface Props {
  componentId: string;
  componentName: string;
  componentColor: string | null;
  leadName: string | null;
  eventSlug: string;
  existingRequestId?: string | null;
  existingRequestStatus?: "pending" | "denied" | null;
  cooldownUntil?: string | null;
}

export function LockedComponentCard({
  componentId,
  componentName,
  componentColor,
  leadName,
  eventSlug,
  existingRequestId,
  existingRequestStatus,
  cooldownUntil,
}: Props) {
  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [requestId, setRequestId] = useState(existingRequestId ?? null);
  const [requestStatus, setRequestStatus] = useState(existingRequestStatus ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accentColor = componentColor ?? "#64748b";
  const isPendingRequest = requestStatus === "pending";
  const cooldownDate = cooldownUntil ? new Date(cooldownUntil) : null;
  const inCooldown = cooldownDate && new Date() < cooldownDate;

  function handleRequestClick() {
    if (isPendingRequest || inCooldown) return;
    setShowNoteInput(true);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await requestComponentAccess(componentId, note.trim() || null, eventSlug);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        setRequestId(result.data.id);
        setRequestStatus("pending");
        setShowNoteInput(false);
        setNote("");
      }
    });
  }

  function handleCancel() {
    if (!requestId) return;
    startTransition(async () => {
      const result = await cancelComponentAccessRequest(requestId, eventSlug);
      if (result.error) { setError(result.error); return; }
      setRequestId(null);
      setRequestStatus(null);
    });
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl h-full flex flex-col overflow-hidden">
      {/* Icon area */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accentColor}1a` }}
          >
            <Lock className="w-3.5 h-3.5 text-white/20" />
          </div>
        </div>

        <span className="text-sm font-semibold text-white/25 truncate mb-1">{componentName}</span>

        {leadName && (
          <p className="text-[11px] text-white/20 mb-3">
            Lead: <span className="text-white/30">{leadName}</span>
          </p>
        )}

        <div className="mt-auto pt-3">
          {isPendingRequest ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-white/25">
                <Clock className="w-3 h-3" />
                <span>Request pending</span>
              </div>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="w-full h-7 rounded-lg border border-white/[0.08] text-[11px] text-white/30 hover:bg-white/[0.04] hover:text-white/50 transition-all disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          ) : inCooldown ? (
            <p className="text-[11px] text-white/20">
              Re-request after {cooldownDate!.toLocaleDateString()}
            </p>
          ) : showNoteInput ? (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional)..."
                rows={2}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] p-2 text-white/50 placeholder:text-white/20 resize-none focus:outline-none focus:border-violet-500/40 transition-colors"
              />
              {error && <p className="text-[11px] text-red-400/70">{error}</p>}
              <div className="flex gap-1.5">
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="flex-1 h-7 bg-violet-600 hover:bg-violet-500 rounded-lg text-[11px] font-semibold text-white transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  Send
                </button>
                <button
                  onClick={() => { setShowNoteInput(false); setError(null); }}
                  className="flex-1 h-7 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-lg text-[11px] text-white/30 hover:text-white/50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleRequestClick}
              className="w-full h-8 border border-white/[0.08] rounded-lg text-[11px] font-semibold text-white/30 hover:bg-white/[0.06] hover:text-white/50 hover:border-white/[0.14] transition-all"
            >
              Request Access
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
