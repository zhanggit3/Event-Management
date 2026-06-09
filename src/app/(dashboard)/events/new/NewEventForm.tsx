"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";
import { slugify } from "@/lib/utils";
import type { ComponentTemplate } from "@/types/database";

export function NewEventForm({ orgId, templates }: { orgId: string; templates: ComponentTemplate[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [address, setAddress] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    if (!orgId || orgId === "no-org") {
      // No real org — navigate without saving
      const slug = slugify(name.trim());
      const params = new URLSearchParams({ name: name.trim(), description, event_date: eventDate, new: "1" });
      router.push(`/events/${slug}/settings?${params.toString()}`);
      return;
    }

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("description", description);
    formData.set("event_date", eventDate);
    formData.set("address", address);
    formData.set("organization_id", orgId);
    formData.set("template_ids", JSON.stringify(selectedTemplateIds));

    try {
      const result = await createEvent(formData);
      if (!result) return;
      if ("error" in result) {
        setError(result.error ?? "Unknown error");
        setLoading(false);
      } else if ("slug" in result) {
        window.location.href = `/events/${result.slug}`;
      }
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#05050F] flex flex-col items-center justify-start px-4 py-10 overflow-hidden">
      {/* Emerald glow blob */}
      <div
        className="pointer-events-none absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(ellipse at center, #10B981 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative w-full max-w-lg">
        {/* Back link */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm font-medium"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back
          </Link>
        </div>

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
            Create New Event
          </h1>
          <p className="text-sm text-white/40">
            Set up your event details and start building your team.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error strip */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Event name */}
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="block text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Event Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AAPI Culture Fest 2026"
                required
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label
                htmlFor="description"
                className="block text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the event..."
                rows={3}
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <label
                htmlFor="address"
                className="block text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Address
              </label>
              <input
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, City, State"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>

            {/* Event date */}
            <div className="space-y-2">
              <label
                htmlFor="event_date"
                className="block text-xs font-medium text-white/50 uppercase tracking-wider"
              >
                Event Date
              </label>
              <input
                id="event_date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl h-11 px-4 text-white focus:outline-none focus:border-emerald-500/50 transition-colors [color-scheme:dark]"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl h-11 px-6 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create Event"}
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center bg-white/[0.06] border border-white/10 hover:bg-white/[0.10] text-white/70 hover:text-white font-medium rounded-xl px-6 h-11 transition-all text-sm"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Component templates — pick saved templates to spin up as components on create */}
        {orgId !== "no-org" && (
          <div className="mt-8">
            <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-1">
              Start from templates
            </p>
            <p className="text-xs text-white/25 mb-4 leading-relaxed">
              Optionally pick saved component templates — each becomes a component (with its activities &amp; tasks) in the new event, alongside Finance.
            </p>

            {templates.length === 0 ? (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 text-center">
                <p className="text-sm text-white/50">No saved templates yet.</p>
                <p className="text-xs text-white/30 mt-1 leading-relaxed">
                  Save any component as a template from its page, then manage them under{" "}
                  <Link href="/company/templates" className="text-emerald-400/80 hover:text-emerald-400 underline">
                    Company → Templates
                  </Link>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((t) => {
                  const selected = selectedTemplateIds.includes(t.id);
                  const activityCount = Array.isArray(t.structure_json) ? t.structure_json.length : 0;
                  const taskCount = Array.isArray(t.structure_json)
                    ? t.structure_json.reduce((sum, a) => sum + (a.tasks?.length ?? 0), 0)
                    : (Array.isArray(t.tasks_json) ? t.tasks_json.length : 0);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTemplate(t.id)}
                      aria-pressed={selected}
                      className={`text-left rounded-xl p-4 border transition-all ${
                        selected
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-white/[0.06] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                            selected ? "bg-emerald-500 border-emerald-500 text-white" : "border-white/20 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className="text-sm font-semibold text-white/80 truncate">{t.name}</span>
                      </div>
                      <p className="text-xs text-white/30 mt-2">
                        {activityCount} {activityCount === 1 ? "activity" : "activities"} · {taskCount} {taskCount === 1 ? "task" : "tasks"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
