"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function NewEventForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const result = await createEvent(formData);
      if (!result) return;
      if ("error" in result) {
        setError(result.error ?? "Unknown error");
        setLoading(false);
      } else if ("slug" in result) {
        window.location.href = `/events/${result.slug}/settings`;
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

        {/* Component templates reference */}
        <div className="mt-8">
          <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-4">
            Component Templates
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: "Festival / Culture Fest", components: ["Community Hub", "Finance", "Marketing", "Performance", "Program", "Volunteer", "Art Auction"] },
              { title: "Art Collective", components: ["Curation", "Artist Outreach", "Venue", "Marketing", "Sales", "Documentation"] },
              { title: "Conference", components: ["Program", "Speakers", "Sponsors", "Logistics", "A/V", "Registration"] },
              { title: "Fundraiser", components: ["Outreach", "Donations", "Auction", "Entertainment", "Logistics", "Volunteers"] },
            ].map(({ title, components }) => (
              <div
                key={title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4"
              >
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">
                  {title}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {components.map((c) => (
                    <span
                      key={c}
                      className="text-xs bg-white/[0.05] border border-white/[0.08] text-white/40 px-2 py-0.5 rounded-full"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/25 mt-4 leading-relaxed">
            Templates are for reference only — add components from event settings after creation.
          </p>
        </div>
      </div>
    </div>
  );
}
