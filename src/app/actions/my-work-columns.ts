"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MyWorkViewConfig } from "@/types/database";

// Token used in the saved column order to refer to a custom column.
const colToken = (id: string) => `col:${id}`;

/**
 * Create a personal text column and append it to the user's saved column order so
 * it shows up in the right place. Returns the new column { id, name }.
 */
export async function addCustomColumn(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Column name required" };

  const { data: column, error } = await supabase
    .from("my_work_columns")
    .insert({ user_id: user.id, name: trimmed })
    .select("id, name")
    .single();
  if (error || !column) return { error: error?.message ?? "Failed to add column" };

  // Append the new column to the saved order (create the view row if absent).
  const { data: view } = await supabase
    .from("my_work_view")
    .select("column_order")
    .eq("user_id", user.id)
    .maybeSingle();
  const order = ((view?.column_order as string[] | null) ?? []).filter(Boolean);
  const nextOrder = [...order, colToken(column.id)];
  await supabase
    .from("my_work_view")
    .upsert(
      { user_id: user.id, column_order: nextOrder, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  revalidatePath("/my-work");
  return { data: { id: column.id as string, name: column.name as string } };
}

/** Rename a personal column the user owns. */
export async function renameCustomColumn(id: string, name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Column name required" };

  const { error } = await supabase
    .from("my_work_columns")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/my-work");
  return { success: true };
}

/** Delete a personal column (its cells cascade) and drop it from the saved order. */
export async function deleteCustomColumn(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("my_work_columns")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  const { data: view } = await supabase
    .from("my_work_view")
    .select("column_order")
    .eq("user_id", user.id)
    .maybeSingle();
  if (view) {
    const order = ((view.column_order as string[] | null) ?? []).filter(
      (t) => t !== colToken(id),
    );
    await supabase
      .from("my_work_view")
      .update({ column_order: order, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

  revalidatePath("/my-work");
  return { success: true };
}

/**
 * Set (or clear) the value of one custom cell for a task. An empty value deletes the
 * row so empty cells store nothing. Never touches the tasks table.
 */
export async function setCellValue(columnId: string, taskId: string, value: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = value.trim();
  if (trimmed === "") {
    const { error } = await supabase
      .from("my_work_cells")
      .delete()
      .eq("user_id", user.id)
      .eq("column_id", columnId)
      .eq("task_id", taskId);
    if (error) return { error: error.message };
    return { success: true };
  }

  const { error } = await supabase.from("my_work_cells").upsert(
    {
      user_id: user.id,
      column_id: columnId,
      task_id: taskId,
      value: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "column_id,task_id" },
  );
  if (error) return { error: error.message };
  return { success: true };
}

/** Persist the user's column layout (order / hidden / widths). One row per user. */
export async function saveViewLayout(config: MyWorkViewConfig) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("my_work_view").upsert(
    {
      user_id: user.id,
      column_order: config.column_order,
      hidden: config.hidden,
      widths: config.widths,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };
  return { success: true };
}

/** Reset the layout back to defaults by clearing the saved view row. */
export async function resetViewLayout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("my_work_view").delete().eq("user_id", user.id);
  if (error) return { error: error.message };
  return { success: true };
}
