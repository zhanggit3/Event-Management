"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

const VALID_MEMBER_ROLES = ["lead", "member"] as const;
type MemberRole = typeof VALID_MEMBER_ROLES[number];
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

type TemplateTask = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

export async function createComponent(formData: FormData) {
  const supabase = await createClient();

  const eventId = formData.get("event_id") as string;
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;
  const eventSlug = formData.get("event_slug") as string;

  if (!name?.trim()) return { error: "Component name is required" };
  if (color && !HEX_COLOR_RE.test(color)) return { error: "Invalid color format" };

  const { data: existing } = await supabase
    .from("components")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sortOrder = existing ? existing.sort_order + 1 : 0;

  const { error } = await supabase.from("components").insert({
    event_id: eventId,
    name: name.trim(),
    slug: slugify(name),
    color: color || null,
    sort_order: sortOrder,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  return { success: true };
}

export async function createComponentFromTemplate(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const eventId = formData.get("event_id") as string;
  const eventSlug = formData.get("event_slug") as string;
  const name = formData.get("name") as string;
  const color = formData.get("color") as string;
  const tasksJson = formData.get("tasks_json") as string;

  if (color && !HEX_COLOR_RE.test(color)) return { error: "Invalid color format" };

  const { data: existing } = await supabase
    .from("components")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sortOrder = existing ? existing.sort_order + 1 : 0;

  const { data: component, error: compError } = await supabase
    .from("components")
    .insert({
      event_id: eventId,
      name: name.trim(),
      slug: slugify(name),
      color: color || null,
      sort_order: sortOrder,
      is_active: true,
    })
    .select()
    .single();

  if (compError || !component) return { error: compError?.message ?? "Failed to create component" };

  // Bulk-insert template tasks if present
  if (tasksJson && user) {
    let tasks: TemplateTask[] = [];
    try {
      const parsed = JSON.parse(tasksJson);
      if (Array.isArray(parsed)) {
        tasks = parsed.filter((t): t is TemplateTask => typeof t?.title === "string");
      }
    } catch {
      // Malformed tasks JSON — skip task insertion, component was created successfully
    }
    if (tasks.length > 0) {
      await supabase.from("tasks").insert(
        tasks.map((t) => ({
          component_id: component.id,
          title: t.title,
          description: t.description || null,
          priority: t.priority || "medium",
          status: "todo",
          created_by: user.id,
        }))
      );
    }
  }

  revalidatePath(`/events/${eventSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  return { success: true };
}

export async function saveComponentAsTemplate(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const componentId = formData.get("component_id") as string;
  const templateName = formData.get("name") as string;
  const color = formData.get("color") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!templateName?.trim()) return { error: "Template name is required" };

  // Derive org server-side — never trust client-supplied organization_id
  const { data: comp } = await supabase.from("components").select("event_id").eq("id", componentId).single();
  if (!comp) return { error: "Component not found" };

  const { data: ev } = await supabase.from("events").select("organization_id").eq("id", comp.event_id).single();
  if (!ev) return { error: "Event not found" };

  const { data: membership } = await supabase.from("organization_members").select("role")
    .eq("organization_id", ev.organization_id).eq("user_id", user.id).single();
  if (!membership) return { error: "Not authorized" };

  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, description, priority")
    .eq("component_id", componentId)
    .order("created_at", { ascending: true });

  const tasksJson = (tasks ?? []).map(({ title, description, priority }) => ({
    title,
    description: description ?? undefined,
    priority: priority as TemplateTask["priority"],
  }));

  const { error } = await supabase.from("component_templates").insert({
    organization_id: ev.organization_id,
    name: templateName.trim(),
    slug: slugify(templateName),
    color: color || null,
    description: `Saved from ${componentSlug} component`,
    tasks_json: tasksJson,
  });

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  return { success: true };
}

export async function updateComponent(componentId: string, updates: {
  name?: string;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
  sort_order?: number;
}, eventSlug: string) {
  const supabase = await createClient();

  if (updates.color && !HEX_COLOR_RE.test(updates.color)) {
    return { error: "Invalid color format" };
  }

  // Explicit allowlist — never spread the full updates object to prevent column injection
  const safe: Record<string, unknown> = {};
  if (updates.name !== undefined) safe.name = updates.name;
  if (updates.icon !== undefined) safe.icon = updates.icon;
  if (updates.color !== undefined) safe.color = updates.color;
  if (updates.is_active !== undefined) safe.is_active = updates.is_active;
  if (updates.sort_order !== undefined) safe.sort_order = updates.sort_order;

  const { error } = await supabase
    .from("components")
    .update(safe)
    .eq("id", componentId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  return { success: true };
}

export async function deleteComponent(componentId: string, eventSlug: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("components")
    .delete()
    .eq("id", componentId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  return { success: true };
}

export async function reorderComponents(
  components: { id: string; sort_order: number }[],
  eventSlug: string
) {
  const supabase = await createClient();

  const results = await Promise.all(
    components.map(({ id, sort_order }) =>
      supabase.from("components").update({ sort_order }).eq("id", id)
    )
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return { error: `Failed to reorder ${failed.length} component(s)` };
  }

  revalidatePath(`/events/${eventSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  return { success: true };
}

export async function updateComponentMember(
  memberId: string,
  updates: { name: string; email: string | null; role: string },
  eventSlug: string,
  componentSlug: string
) {
  const supabase = await createClient();

  const role: MemberRole = VALID_MEMBER_ROLES.includes(updates.role as MemberRole)
    ? (updates.role as MemberRole)
    : "member";
  const safe = { name: updates.name, email: updates.email, role };

  const { error } = await supabase
    .from("component_members")
    .update(safe)
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function addComponentMember(formData: FormData) {
  const supabase = await createClient();

  const componentId = formData.get("component_id") as string;
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const roleRaw = (formData.get("role") as string) || "member";
  const role: MemberRole = VALID_MEMBER_ROLES.includes(roleRaw as MemberRole) ? (roleRaw as MemberRole) : "member";
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  if (!name?.trim()) return { error: "Name is required" };

  const { error } = await supabase.from("component_members").insert({
    component_id: componentId,
    name: name.trim(),
    email: email?.trim() || null,
    role,
  });

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

export async function removeComponentMember(memberId: string, eventSlug: string, componentSlug: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("component_members").delete().eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { success: true };
}

