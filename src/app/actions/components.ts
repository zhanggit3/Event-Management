"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { TemplateActivity, ComponentTemplate } from "@/types/database";

const VALID_MEMBER_ROLES = ["lead", "member"] as const;
type MemberRole = typeof VALID_MEMBER_ROLES[number];
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const ACTIVITY_PRIORITIES = ["low", "medium", "high", "critical"] as const;

type TemplateTask = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

function coerceTaskPriority(p: unknown): "low" | "medium" | "high" | "urgent" {
  return (TASK_PRIORITIES as readonly string[]).includes(p as string)
    ? (p as "low" | "medium" | "high" | "urgent")
    : "medium";
}
function coerceActivityPriority(p: unknown): "low" | "medium" | "high" | "critical" | null {
  return (ACTIVITY_PRIORITIES as readonly string[]).includes(p as string)
    ? (p as "low" | "medium" | "high" | "critical")
    : null;
}

/** Parse a JSON string into TemplateActivity[], tolerating malformed input (returns []). */
function parseStructure(raw: string | null): TemplateActivity[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Blank-named activities/tasks/subtasks are dropped (the editor lets users add empty
    // rows; we never persist or instantiate nameless entries).
    const nonBlank = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
    return parsed
      .filter((a): a is Record<string, unknown> => nonBlank(a?.name))
      .map((a) => ({
        name: (a.name as string).trim(),
        description: typeof a.description === "string" ? a.description : undefined,
        priority: coerceActivityPriority(a.priority),
        tasks: Array.isArray(a.tasks)
          ? (a.tasks as Record<string, unknown>[])
              .filter((t) => nonBlank(t?.title))
              .map((t) => ({
                title: (t.title as string).trim(),
                description: typeof t.description === "string" ? t.description : undefined,
                priority: coerceTaskPriority(t.priority),
                subtasks: Array.isArray(t.subtasks)
                  ? (t.subtasks as Record<string, unknown>[])
                      .filter((s) => nonBlank(s?.title))
                      .map((s) => ({
                        title: (s.title as string).trim(),
                        description: typeof s.description === "string" ? s.description : undefined,
                        priority: coerceTaskPriority(s.priority),
                      }))
                  : [],
              }))
          : [],
      }));
  } catch {
    return [];
  }
}

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
  const structureRaw = formData.get("structure_json") as string | null;

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

  // Prefer the nested structure (activities → tasks → subtasks). Fall back to the
  // flat tasks_json for templates saved before ISSUE-012. Each tier is wrapped so a
  // single failure can't abort component creation (the component already exists).
  const structure = parseStructure(structureRaw);

  if (structure.length > 0 && user) {
    try {
      for (let ai = 0; ai < structure.length; ai++) {
        const act = structure[ai];
        const { data: newActivity } = await supabase
          .from("activities")
          .insert({
            component_id: component.id,
            name: act.name,
            description: act.description || null,
            color: "#6366f1",
            status: "active",
            priority: coerceActivityPriority(act.priority),
            reporter_id: user.id,
            sort_order: ai,
          })
          .select("id")
          .single();
        if (!newActivity) continue;

        for (const task of act.tasks) {
          const { data: newTask } = await supabase
            .from("tasks")
            .insert({
              component_id: component.id,
              activity_id: newActivity.id,
              parent_task_id: null,
              title: task.title,
              description: task.description || null,
              priority: coerceTaskPriority(task.priority),
              status: "todo",
              created_by: user.id,
            })
            .select("id")
            .single();
          if (!newTask) continue;

          if (task.subtasks.length > 0) {
            // tasks.activity_id is NOT NULL — a subtask carries its parent task's activity.
            await supabase.from("tasks").insert(
              task.subtasks.map((s) => ({
                component_id: component.id,
                activity_id: newActivity.id,
                parent_task_id: newTask.id,
                title: s.title,
                description: s.description || null,
                priority: coerceTaskPriority(s.priority),
                status: "todo",
                created_by: user.id,
              }))
            );
          }
        }
      }
    } catch (e) {
      // Structure instantiation failed partway — component was still created successfully.
      console.error("createComponentFromTemplate: structure instantiation failed", e);
    }
  } else if (tasksJson && user) {
    // Legacy flat-tasks fallback (templates saved before ISSUE-012, no structure).
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
      // The flat-tasks path is all-or-nothing: if the home activity or its tasks can't
      // be created, roll back the component we already inserted so the user sees a clean
      // failure (and a retry doesn't strand a duplicate, task-less component). Deleting
      // the component cascades to any partial activity/tasks (same as deleteComponent).
      const rollback = async (message: string) => {
        await supabase.from("components").delete().eq("id", component.id);
        return { error: message };
      };
      // tasks.activity_id is NOT NULL — flat tasks need a home activity, so create one.
      const { data: defaultActivity, error: activityError } = await supabase
        .from("activities")
        .insert({
          component_id: component.id,
          name: "Tasks",
          color: "#6366f1",
          status: "active",
          reporter_id: user.id,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (!defaultActivity) {
        console.error("createComponentFromTemplate: default activity insert failed", activityError);
        return rollback(activityError?.message ?? "Could not create the component's tasks.");
      }
      const { error: tasksError } = await supabase.from("tasks").insert(
        tasks.map((t) => ({
          component_id: component.id,
          activity_id: defaultActivity.id,
          title: t.title,
          description: t.description || null,
          priority: coerceTaskPriority(t.priority),
          status: "todo",
          created_by: user.id,
        }))
      );
      if (tasksError) {
        console.error("createComponentFromTemplate: legacy task insert failed", tasksError);
        return rollback(tasksError.message);
      }
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
  const rawName = formData.get("name") as string | null;
  const color = formData.get("color") as string;
  const eventSlug = formData.get("event_slug") as string;
  const componentSlug = formData.get("component_slug") as string;

  // Derive org + names server-side — never trust client-supplied organization_id
  const { data: comp } = await supabase.from("components").select("name, event_id").eq("id", componentId).single();
  if (!comp) return { error: "Component not found" };

  const { data: ev } = await supabase.from("events").select("name, organization_id").eq("id", comp.event_id).single();
  if (!ev) return { error: "Event not found" };

  const { data: membership } = await supabase.from("organization_members").select("role")
    .eq("organization_id", ev.organization_id).eq("user_id", user.id).single();
  // Matches the component_templates INSERT RLS policy (is_org_admin) — a plain member
  // would otherwise pass this check and then hit a confusing raw RLS rejection.
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only organization admins can save templates" };
  }

  // Default name = "{component name} — {event name}" when the caller leaves it blank.
  const templateName = (rawName?.trim() || `${comp.name} — ${ev.name}`).trim();

  // Fetch activities + all tasks, then assemble the nested structure.
  const [{ data: activities }, { data: tasks }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, name, description, priority, sort_order")
      .eq("component_id", componentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tasks")
      .select("id, title, description, priority, parent_task_id, activity_id")
      .eq("component_id", componentId)
      .order("created_at", { ascending: true }),
  ]);

  const allTasks = tasks ?? [];
  const topLevel = allTasks.filter((t) => !t.parent_task_id);
  const subtasksByParent = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    if (t.parent_task_id) {
      const arr = subtasksByParent.get(t.parent_task_id) ?? [];
      arr.push(t);
      subtasksByParent.set(t.parent_task_id, arr);
    }
  }

  const buildTaskNode = (t: typeof allTasks[number]) => ({
    title: t.title,
    description: t.description ?? undefined,
    priority: coerceTaskPriority(t.priority),
    subtasks: (subtasksByParent.get(t.id) ?? []).map((s) => ({
      title: s.title,
      description: s.description ?? undefined,
      priority: coerceTaskPriority(s.priority),
    })),
  });

  const structureJson: TemplateActivity[] = (activities ?? []).map((a) => ({
    name: a.name,
    description: a.description ?? undefined,
    priority: coerceActivityPriority(a.priority),
    tasks: topLevel.filter((t) => t.activity_id === a.id).map(buildTaskNode),
  }));

  // Backward compat: flat top-level tasks for the existing Library tab.
  const tasksJson = topLevel.map(({ title, description, priority }) => ({
    title,
    description: description ?? undefined,
    priority: coerceTaskPriority(priority),
  }));

  const { error } = await supabase.from("component_templates").insert({
    organization_id: ev.organization_id,
    name: templateName,
    slug: slugify(templateName),
    color: color || null,
    description: `Saved from ${componentSlug} component`,
    tasks_json: tasksJson,
    structure_json: structureJson,
    source_event_name: ev.name,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  revalidatePath(`/events/${eventSlug}/settings`);
  revalidatePath("/company/templates");
  return { success: true };
}

export type TemplateWithMeta = ComponentTemplate & { org_name: string; can_manage: boolean };

/**
 * Fetch templates across ALL of the caller's (non-workspace) organizations — the Company
 * section is company-wide, not scoped to a single org. Each template is tagged with its
 * org name and whether the caller can manage it (owner/admin in that org).
 */
export async function getAccessibleTemplates(): Promise<TemplateWithMeta[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, is_workspace)")
    .eq("user_id", user.id);

  // Include ALL the user's orgs — including their personal workspace. Templates a user
  // saves from a workspace event live in the workspace org; filtering those out hid them.
  const orgs = (memberships ?? [])
    .filter((m) => m.organizations)
    .map((m) => ({
      id: m.organization_id as string,
      name: (m.organizations as unknown as { name: string; is_workspace: boolean }).is_workspace
        ? "My Workspace"
        : (m.organizations as unknown as { name: string }).name,
      role: m.role as string,
    }));
  if (orgs.length === 0) return [];

  const orgById = new Map(orgs.map((o) => [o.id, o]));
  // Only the templates THIS user saved (across any org they belong to).
  const { data } = await supabase
    .from("component_templates")
    .select("id, organization_id, name, slug, icon, color, description, tasks_json, structure_json, source_event_name, created_at, created_by")
    .eq("created_by", user.id)
    .in("organization_id", orgs.map((o) => o.id))
    .order("created_at", { ascending: false });

  return (data ?? []).map((t) => {
    const org = orgById.get(t.organization_id as string);
    return {
      ...(t as ComponentTemplate),
      org_name: org?.name ?? "",
      can_manage: org ? ["owner", "admin"].includes(org.role) : false,
    };
  });
}

/** Fetch all templates for an org. Caller must be an org member (RLS also enforces SELECT). */
export async function getOrgTemplates(organizationId: string): Promise<ComponentTemplate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return [];

  const { data } = await supabase
    .from("component_templates")
    .select("id, organization_id, name, slug, icon, color, description, tasks_json, structure_json, source_event_name, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  return (data ?? []) as ComponentTemplate[];
}

/**
 * Resolve a template's org and verify the caller is an org admin.
 * Templates can only be modified/deleted by org admins (matches RLS).
 */
async function assertTemplateAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  userId: string,
): Promise<{ orgId: string } | { error: string }> {
  const { data: tmpl } = await supabase
    .from("component_templates")
    .select("organization_id")
    .eq("id", templateId)
    .single();
  if (!tmpl?.organization_id) return { error: "Template not found" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", tmpl.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only organization admins can modify templates" };
  }
  return { orgId: tmpl.organization_id };
}

/** Rename a template and/or replace its nested structure. Org admins only. */
export async function updateTemplate(
  templateId: string,
  updates: { name?: string; structure_json?: TemplateActivity[] },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const guard = await assertTemplateAdmin(supabase, templateId, user.id);
  if ("error" in guard) return guard;

  const patch: Record<string, unknown> = {};
  let normalizedName: string | undefined;
  let normalizedStructure: TemplateActivity[] | undefined;
  let normalizedTasksJson: { title: string; description?: string; priority?: string }[] | undefined;

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) return { error: "Template name is required" };
    normalizedName = trimmed;
    patch.name = trimmed;
    patch.slug = slugify(trimmed);
  }
  if (updates.structure_json !== undefined) {
    // Re-parse through the tolerant parser to normalize/validate the shape (drops blanks, trims).
    normalizedStructure = parseStructure(JSON.stringify(updates.structure_json));
    // Keep tasks_json in sync with the new top-level tasks (backward compat).
    normalizedTasksJson = normalizedStructure.flatMap((a) =>
      a.tasks.map((t) => ({ title: t.title, description: t.description, priority: t.priority })),
    );
    patch.structure_json = normalizedStructure;
    patch.tasks_json = normalizedTasksJson;
  }
  if (Object.keys(patch).length === 0) {
    return { success: true as const, name: normalizedName, structure_json: normalizedStructure, tasks_json: normalizedTasksJson };
  }

  const { error } = await supabase.from("component_templates").update(patch).eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/company/templates");
  // Return the server-normalized values so the client's optimistic update matches the DB.
  return {
    success: true as const,
    name: normalizedName,
    structure_json: normalizedStructure,
    tasks_json: normalizedTasksJson,
  };
}

/** Delete a template. Org admins only. */
export async function deleteTemplate(templateId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const guard = await assertTemplateAdmin(supabase, templateId, user.id);
  if ("error" in guard) return guard;

  const { error } = await supabase.from("component_templates").delete().eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/company/templates");
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

