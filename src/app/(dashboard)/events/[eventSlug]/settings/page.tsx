import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Layers, ArrowLeft } from "lucide-react";
import { AddComponentDialog, type ComponentTemplate, type EventWithComponents } from "@/components/add-component-dialog";
import { ComponentListManager } from "@/components/component-list-manager";
import { updateEvent, deleteEvent } from "@/app/actions/events";
import { EventCollaboratorsPanel } from "@/components/event-collaborators-panel";

interface PageProps {
  params: Promise<{ eventSlug: string }>;
}

export default async function EventSettingsPage({ params }: PageProps) {
  const { eventSlug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  type EventShape = { id: string; name: string; slug: string; status: string; description: string | null; event_date: string | null; organization_id: string };
  type ComponentShape = { id: string; event_id: string; name: string; slug: string; icon: string; color: string; sort_order: number; is_active: boolean; description: null; created_at: string };
  type CollaboratorShape = {
    user_id: string;
    role: string;
    profile: { id: string; full_name: string; email: string } | null;
    grants: { component_id: string }[];
  };

  let event: EventShape | null = null;
  let components: ComponentShape[] = [];
  let templates: ComponentTemplate[] = [];
  let otherEvents: EventWithComponents[] = [];
  let collaborators: CollaboratorShape[] = [];
  let isOrgAdmin = false;

  if (user) {
    const { data: dbEvent } = await supabase.from("events").select("*").eq("slug", eventSlug).single();
    if (dbEvent) {
      // Authorization: only org admins/owners may access event settings
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", dbEvent.organization_id)
        .eq("user_id", user.id)
        .single();
      isOrgAdmin = membership?.role === "owner" || membership?.role === "admin";
      if (!isOrgAdmin) notFound();

      event = dbEvent as EventShape;
      const { data: dbComponents } = await supabase.from("components").select("*").eq("event_id", dbEvent.id).order("sort_order", { ascending: true });
      components = (dbComponents ?? []) as ComponentShape[];

      // Fetch event collaborators (event_members)
      // Note: event_members.user_id → auth.users (not profiles), so profiles are fetched separately.
      // Note: event_member_components has no direct FK to event_members, so grants are fetched separately too.
      const { data: eventMembers } = await supabase
        .from("event_members")
        .select("user_id, role")
        .eq("event_id", dbEvent.id);

      if (eventMembers && eventMembers.length > 0) {
        const memberUserIds = eventMembers.map((m) => m.user_id);

        // Fetch profiles for all event members in one query
        const { data: memberProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", memberUserIds);

        // Fetch all component grants for this event's members in one query
        const { data: memberGrants } = await supabase
          .from("event_member_components")
          .select("user_id, component_id")
          .eq("event_id", dbEvent.id)
          .in("user_id", memberUserIds);

        const profileMap = new Map((memberProfiles ?? []).map((p) => [p.id, p]));
        // Build a map of user_id -> component grants
        const grantsMap = new Map<string, { component_id: string }[]>();
        for (const g of memberGrants ?? []) {
          const existing = grantsMap.get(g.user_id) ?? [];
          existing.push({ component_id: g.component_id });
          grantsMap.set(g.user_id, existing);
        }

        collaborators = eventMembers.map((m) => ({
          user_id: m.user_id,
          role: m.role,
          profile: profileMap.get(m.user_id) ?? null,
          grants: grantsMap.get(m.user_id) ?? [],
        }));
      }

      // Fetch org templates + system templates (organization_id IS NULL)
      const { data: dbTemplates } = await supabase
        .from("component_templates")
        .select("id, name, slug, icon, color, description, tasks_json")
        .or(`organization_id.eq.${dbEvent.organization_id},organization_id.is.null`)
        .order("name");
      templates = (dbTemplates ?? []) as ComponentTemplate[];

      // Fetch other events in the org with their components (for clone tab)
      const { data: dbOtherEvents } = await supabase
        .from("events")
        .select("id, name, slug, components(id, name, slug, icon, color)")
        .eq("organization_id", dbEvent.organization_id)
        .neq("id", dbEvent.id)
        .order("created_at", { ascending: false });
      otherEvents = (dbOtherEvents ?? []) as unknown as EventWithComponents[];
    }
  }

  if (!event) notFound();

  async function handleUpdateEvent(formData: FormData) {
    "use server";
    await updateEvent(event!.id, formData);
  }

  const inputClass =
    "w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] transition-all";

  const labelClass = "block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-[#05050F] p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/events/${eventSlug}`}
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {event.name}
          </Link>
          <h1 className="text-2xl font-bold text-white">Event Settings</h1>
        </div>

        {/* Event Details card */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-white mb-4">Event Details</h2>
          <form action={handleUpdateEvent} className="space-y-5">

            {/* Event name */}
            <div>
              <label htmlFor="name" className={labelClass}>Event Name</label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={event.name}
                required
                className={inputClass}
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className={labelClass}>Description</label>
              <textarea
                id="description"
                name="description"
                defaultValue={event.description ?? ""}
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.08] transition-all resize-none"
              />
            </div>

            {/* Address */}
            <div>
              <label htmlFor="address" className={labelClass}>Address</label>
              <input
                id="address"
                name="address"
                type="text"
                placeholder="123 Main St, City, State"
                defaultValue={(event as { address?: string | null }).address ?? ""}
                className={inputClass}
              />
            </div>

            {/* Date + Status row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="event_date" className={labelClass}>Event Date</label>
                <input
                  id="event_date"
                  name="event_date"
                  type="date"
                  defaultValue={event.event_date ?? ""}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="status" className={labelClass}>Status</label>
                <select
                  id="status"
                  name="status"
                  defaultValue={event.status}
                  className={`${inputClass} appearance-none cursor-pointer`}
                >
                  <option value="draft" className="bg-[#0e0e1a] text-white">Draft</option>
                  <option value="active" className="bg-[#0e0e1a] text-white">Active</option>
                  <option value="completed" className="bg-[#0e0e1a] text-white">Completed</option>
                  <option value="archived" className="bg-[#0e0e1a] text-white">Archived</option>
                </select>
              </div>
            </div>

            {/* Save button */}
            <div className="pt-1">
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl h-10 px-5 shadow-lg shadow-amber-500/20 transition-all"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Components card */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-white/40" />
                Components
              </h2>
              <p className="text-xs text-white/30 mt-0.5">
                Add the modules your event needs.
              </p>
            </div>
            <AddComponentDialog
              eventId={event.id}
              eventSlug={eventSlug}
              templates={templates}
              otherEvents={otherEvents}
            />
          </div>

          {components.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-3">
                <Layers className="w-5 h-5 text-white/20" />
              </div>
              <p className="text-sm text-white/30">
                No components yet. Click &quot;Add component&quot; to get started.
              </p>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
              <ComponentListManager
                components={components as Parameters<typeof ComponentListManager>[0]["components"]}
                eventSlug={eventSlug}
              />
            </div>
          )}
        </div>

        {/* External Collaborators panel — org admins only */}
        {isOrgAdmin && (
          <EventCollaboratorsPanel
            collaborators={collaborators}
            components={components.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }))}
            eventId={event.id}
            organizationId={event.organization_id}
          />
        )}

        {/* Danger zone */}
        <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-red-400 mb-1">Danger Zone</h2>
          <p className="text-xs text-white/30 mb-4">
            Deleting an event is permanent and cannot be undone.
          </p>
          <form action={deleteEvent.bind(null, event.id, event.organization_id) as unknown as (fd: FormData) => void}>
            <button
              type="submit"
              className="bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold rounded-xl border border-red-500/20 h-9 px-4 text-sm transition-all"
            >
              Delete Event
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
