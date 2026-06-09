import type { createClient } from "@/lib/supabase/server";
import type { TemplateActivity } from "@/types/database";

// Plain (non-"use server") module: shared template-instantiation logic used by the
// component server actions AND the create-event action. It takes a Supabase client
// (non-serializable) so it must NOT live in a "use server" file, where every export is
// registered as a public RPC action.

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const ACTIVITY_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type TemplateTask = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

export function coerceTaskPriority(p: unknown): "low" | "medium" | "high" | "urgent" {
  return (TASK_PRIORITIES as readonly string[]).includes(p as string)
    ? (p as "low" | "medium" | "high" | "urgent")
    : "medium";
}

export function coerceActivityPriority(p: unknown): "low" | "medium" | "high" | "critical" | null {
  return (ACTIVITY_PRIORITIES as readonly string[]).includes(p as string)
    ? (p as "low" | "medium" | "high" | "critical")
    : null;
}

/** Parse a JSON string into TemplateActivity[], tolerating malformed input (returns []). */
export function parseStructure(raw: string | null): TemplateActivity[] {
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

/**
 * Create one component in an event and instantiate a template's activities → tasks →
 * subtasks (or legacy flat tasks). Used by both the Add-Component dialog and event
 * creation. The caller supplies the resolved `slug` + `sortOrder` (so it can dedupe
 * across multiple components created in one pass). Returns the new component id.
 */
export async function instantiateTemplateComponent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    eventId: string;
    name: string;
    slug: string;
    color: string | null;
    icon?: string | null;
    sortOrder: number;
    tasksJson: string | null;
    structureRaw: string | null;
    userId: string | null;
  },
): Promise<{ componentId?: string; error?: string }> {
  const { eventId, name, slug, color, icon, sortOrder, tasksJson, structureRaw, userId } = input;

  // Ensure the slug is unique within the event. Callers pass a best-effort slug;
  // deduping here keeps every caller (Create-Event batch, Add-Component dialog) safe
  // from the unique(event_id, slug) constraint without each re-implementing it.
  const { data: existingComponents } = await supabase
    .from("components")
    .select("slug")
    .eq("event_id", eventId);
  const taken = new Set((existingComponents ?? []).map((c) => c.slug as string));
  const base = slug || "component";
  let uniqueSlug = base;
  let n = 2;
  while (taken.has(uniqueSlug)) uniqueSlug = `${base}-${n++}`;

  const { data: component, error: compError } = await supabase
    .from("components")
    .insert({
      event_id: eventId,
      name: name.trim(),
      slug: uniqueSlug,
      color: color || null,
      icon: icon || null,
      sort_order: sortOrder,
      is_active: true,
    })
    .select()
    .single();

  if (compError || !component) return { error: compError?.message ?? "Failed to create component" };

  // Prefer the nested structure (activities → tasks → subtasks). Fall back to the
  // flat tasks_json for templates saved before ISSUE-012. Each tier is wrapped so a
  // single failure can't abort component creation (the component already exists).
  const user = userId ? { id: userId } : null;
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
      console.error("instantiateTemplateComponent: structure instantiation failed", e);
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
      // failure (and a retry doesn't strand a duplicate, task-less component).
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
        console.error("instantiateTemplateComponent: default activity insert failed", activityError);
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
        console.error("instantiateTemplateComponent: legacy task insert failed", tasksError);
        return rollback(tasksError.message);
      }
    }
  }

  return { componentId: component.id };
}
