"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { instantiateTemplateComponent } from "@/lib/templates/instantiate";

export async function createEvent(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const eventDate = formData.get("event_date") as string;
  const address = formData.get("address") as string;
  const orgId = formData.get("organization_id") as string;
  const templateIdsRaw = formData.get("template_ids") as string | null;
  let templateIds: string[] = [];
  if (templateIdsRaw) {
    try {
      const parsed = JSON.parse(templateIdsRaw);
      if (Array.isArray(parsed)) templateIds = parsed.filter((x): x is string => typeof x === "string");
    } catch { /* ignore malformed selection */ }
  }

  if (!name?.trim()) return { error: "Event name is required" };

  const slug = slugify(name);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      name: name.trim(),
      slug,
      description: description || null,
      event_date: eventDate || null,
      address: address || null,
      organization_id: orgId,
      created_by: user?.id ?? "00000000-0000-0000-0000-000000000000",
      status: "draft",
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Auto-create the Finance component on every new event. It starts empty — estimates are now
  // added via the "Estimates" activity template (ISSUE-016), not auto-seeded here.
  await supabase
    .from("components")
    .insert({
      event_id: event.id,
      name: "Finance",
      slug: "finance",
      icon: "💰",
      color: "#10b981",
      sort_order: 0,
      is_active: true,
    });

  // Spin up any component templates the user selected on the Create Event form (ISSUE-018 #6).
  // Org-scoped fetch validates ownership; slugs are deduped against Finance and each other.
  if (templateIds.length > 0 && user) {
    const { data: templates } = await supabase
      .from("component_templates")
      .select("id, name, color, tasks_json, structure_json")
      .in("id", templateIds)
      .eq("organization_id", orgId);

    const usedSlugs = new Set<string>(["finance"]);
    let sortOrder = 1;
    for (const t of templates ?? []) {
      const base = slugify(t.name as string) || "component";
      let unique = base;
      let n = 2;
      while (usedSlugs.has(unique)) unique = `${base}-${n++}`;
      usedSlugs.add(unique);

      const res = await instantiateTemplateComponent(supabase, {
        eventId: event.id,
        name: t.name as string,
        slug: unique,
        color: (t.color as string) || null,
        sortOrder: sortOrder++,
        tasksJson: t.tasks_json ? JSON.stringify(t.tasks_json) : null,
        structureRaw: t.structure_json ? JSON.stringify(t.structure_json) : null,
        userId: user.id,
      });
      // Non-fatal: a failed template doesn't block event creation, but surface it in logs.
      if (res.error) console.error(`createEvent: template ${t.id} instantiation failed`, res.error);
    }
  }

  revalidatePath("/");
  return { slug: event.slug };
}

export async function updateEvent(eventId: string, formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const eventDate = formData.get("event_date") as string;
  const address = formData.get("address") as string;
  const status = formData.get("status") as string;

  const { error } = await supabase
    .from("events")
    .update({
      name: name?.trim(),
      description: description || null,
      event_date: eventDate || null,
      address: address || null,
      status,
    })
    .eq("id", eventId);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}

export async function deleteEvent(eventId: string, orgId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) return { error: error.message };

  revalidatePath("/");
  redirect("/");
}
