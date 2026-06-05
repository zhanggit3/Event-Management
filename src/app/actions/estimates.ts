"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Estimate, EstimateColumn, EstimateSection, EstimateLineItem } from "@/types/database";

export type EstimateWithDetails = {
  estimate: Estimate;
  columns: EstimateColumn[];
  sections: (EstimateSection & { lineItems: EstimateLineItem[] })[];
};

// Stamp the parent estimate's updated_at + last_modified_by on any mutation.
// Not exported: only callable inside this server-action module.
async function touchEstimate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string,
  userId: string,
) {
  await supabase
    .from("estimates")
    .update({ last_modified_by: userId, updated_at: new Date().toISOString() })
    .eq("id", estimateId);
}

/**
 * Creates an estimate for an activity with 4 default columns + 2 sections.
 * Proposal number: EST-{YYYY}-{padded count} per org.
 * F-08: accepts userId so the page can pass it from its already-fetched user object,
 * avoiding a second getUser() round-trip.
 */
export async function createEstimate(
  activityId: string,
  componentId: string,
  userId: string,
  eventSlug: string,
  componentSlug: string
): Promise<{ data?: EstimateWithDetails; error?: string }> {
  const supabase = await createClient();

  // Self-describing, team-scoped proposal number: EST-{component slug}-{year}-{NNN}.
  // The sequence restarts per component and uses max-suffix+1 (not count) so it never
  // collides when an estimate is deleted.
  const { data: comp } = await supabase
    .from("components")
    .select("slug, name")
    .eq("id", componentId)
    .single();

  const { data: existing } = await supabase
    .from("estimates")
    .select("proposal_number")
    .eq("component_id", componentId);

  const maxSeq = (existing ?? []).reduce((m, r) => {
    const match = /(\d+)$/.exec(r.proposal_number ?? "");
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);

  const year = new Date().getFullYear();
  const proposal_number = `EST-${comp?.slug ?? "est"}-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
  const proposal_name = `${comp?.name ?? "Estimate"} Estimate`;

  // F-07: Insert estimate; if activity_id UNIQUE constraint fires, fetch the existing row
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .insert({ activity_id: activityId, component_id: componentId, proposal_number, proposal_name, created_by: userId })
    .select()
    .single();

  if (estErr) {
    // 23505 = unique_violation — another concurrent request already created the estimate
    if (estErr.code === "23505") {
      const { data: existingEstimate } = await supabase
        .from("estimates")
        .select("*")
        .eq("activity_id", activityId)
        .single();
      if (existingEstimate) {
        // Fetch columns, sections, line items for the already-created estimate
        const { data: cols } = await supabase
          .from("estimate_columns")
          .select("*")
          .eq("estimate_id", existingEstimate.id)
          .order("sort_order");
        const { data: sections } = await supabase
          .from("estimate_sections")
          .select("*")
          .eq("estimate_id", existingEstimate.id)
          .order("sort_order");
        const { data: lineItems } = await supabase
          .from("estimate_line_items")
          .select("*")
          .eq("estimate_id", existingEstimate.id)
          .order("sort_order");
        return {
          data: {
            estimate: existingEstimate as Estimate,
            columns: (cols ?? []) as EstimateColumn[],
            sections: (sections ?? []).map(s => ({
              ...s,
              lineItems: (lineItems ?? []).filter(li => li.section_id === s.id) as EstimateLineItem[],
            })) as (EstimateSection & { lineItems: EstimateLineItem[] })[],
          },
        };
      }
    }
    return { error: estErr.message };
  }
  if (!estimate) return { error: "Failed to create estimate" };

  // Insert default columns
  const { data: cols, error: colErr } = await supabase
    .from("estimate_columns")
    .insert([
      { estimate_id: estimate.id, name: "Item",   col_type: "text",     sort_order: 0 },
      { estimate_id: estimate.id, name: "Qty",    col_type: "number",   sort_order: 1 },
      { estimate_id: estimate.id, name: "Amount", col_type: "currency", sort_order: 2 },
      { estimate_id: estimate.id, name: "Notes",  col_type: "text",     sort_order: 3 },
    ])
    .select();
  if (colErr || !cols) return { error: colErr?.message ?? "Failed to create columns" };

  const qtyCol    = cols.find(c => c.name === "Qty");
  const amountCol = cols.find(c => c.name === "Amount");

  // Store the qty/amount column IDs for Total computation
  await supabase
    .from("estimates")
    .update({ qty_column_id: qtyCol?.id ?? null, amount_column_id: amountCol?.id ?? null })
    .eq("id", estimate.id);

  // Insert default sections
  const { data: sections, error: secErr } = await supabase
    .from("estimate_sections")
    .insert([
      { estimate_id: estimate.id, name: "Expenses", section_type: "expense", sort_order: 0 },
      { estimate_id: estimate.id, name: "Revenue",  section_type: "revenue", sort_order: 1 },
    ])
    .select();
  if (secErr || !sections) return { error: secErr?.message ?? "Failed to create sections" };

  const fullEstimate = { ...estimate, qty_column_id: qtyCol?.id ?? null, amount_column_id: amountCol?.id ?? null };
  return {
    data: {
      estimate: fullEstimate as Estimate,
      columns: cols as EstimateColumn[],
      sections: sections.map(s => ({ ...s, lineItems: [] })) as (EstimateSection & { lineItems: EstimateLineItem[] })[],
    },
  };
}

export async function updateEstimateStatus(
  estimateId: string,
  status: Estimate["status"],
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("estimates")
    .update({ status, last_modified_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", estimateId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return {};
}

/** Update the editable proposal name (and stamp modifier). */
export async function updateEstimateName(
  estimateId: string,
  name: string,
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("estimates")
    .update({ proposal_name: name.trim() || null, last_modified_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", estimateId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return {};
}

/**
 * Delete an estimate by deleting its generated activity. Deleting the activity cascades to the
 * estimate (estimates_activity_id_fkey is ON DELETE CASCADE), which cascades to its columns,
 * sections, and line items. Doing it in this single, cascading order keeps the operation atomic:
 * if RLS blocks the delete, nothing is removed and the error is surfaced to the caller.
 */
export async function deleteEstimate(
  activityId: string,
  eventSlug: string,
  componentSlug: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("activities").delete().eq("id", activityId);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return {};
}

export async function addEstimateRow(
  estimateId: string,
  sectionId: string,
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ data?: EstimateLineItem; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data, error } = await supabase
    .from("estimate_line_items")
    .insert({ estimate_id: estimateId, section_id: sectionId, cells: {} })
    .select()
    .single();
  if (error) return { error: error.message };
  await touchEstimate(supabase, estimateId, user.id);
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return { data: data as EstimateLineItem };
}

export async function deleteEstimateRow(
  lineItemId: string,
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // Look up the parent estimate before deleting so we can stamp it afterwards.
  const { data: li } = await supabase
    .from("estimate_line_items")
    .select("estimate_id")
    .eq("id", lineItemId)
    .maybeSingle();
  const { error } = await supabase.from("estimate_line_items").delete().eq("id", lineItemId);
  if (error) return { error: error.message };
  if (li?.estimate_id) await touchEstimate(supabase, li.estimate_id as string, user.id);
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return {};
}

export async function upsertEstimateCell(
  lineItemId: string,
  columnId: string,
  value: string,
  estimateId: string,
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // F-03: Use atomic JSONB merge via jsonb_build_object so concurrent updates
  // for different columns on the same row don't clobber each other.
  // The || operator merges: existing cells || {columnId: value}
  const { error } = await supabase.rpc("merge_estimate_cell", {
    p_line_item_id: lineItemId,
    p_column_id: columnId,
    p_value: value,
  });
  if (error) return { error: error.message };

  await touchEstimate(supabase, estimateId, user.id);
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return {};
}

export async function addEstimateColumn(
  estimateId: string,
  name: string,
  colType: EstimateColumn["col_type"],
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ data?: EstimateColumn; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!name.trim()) return { error: "Column name required" };

  // F-02: Use maybeSingle() so zero rows returns null instead of PGRST116 error
  const { data: existing } = await supabase
    .from("estimate_columns")
    .select("sort_order")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("estimate_columns")
    .insert({ estimate_id: estimateId, name: name.trim(), col_type: colType, sort_order: (existing?.sort_order ?? 3) + 1 })
    .select()
    .single();
  if (error) return { error: error.message };
  await touchEstimate(supabase, estimateId, user.id);
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return { data: data as EstimateColumn };
}

export async function deleteEstimateColumn(
  columnId: string,
  estimateId: string,
  eventSlug: string,
  componentSlug: string,
  activityId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Delete the column row
  const { error: colErr } = await supabase.from("estimate_columns").delete().eq("id", columnId);
  if (colErr) return { error: colErr.message };

  // Remove this column's key from all line items (JSONB key removal)
  const { data: rows } = await supabase
    .from("estimate_line_items")
    .select("id, cells")
    .eq("estimate_id", estimateId);

  for (const row of rows ?? []) {
    const cells = row.cells as Record<string, string>;
    if (!(columnId in cells)) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [columnId]: _removed, ...rest } = cells;
    await supabase.from("estimate_line_items").update({ cells: rest }).eq("id", row.id);
  }

  // qty_column_id / amount_column_id FKs are ON DELETE SET NULL — handled by DB automatically
  await touchEstimate(supabase, estimateId, user.id);
  revalidatePath(`/events/${eventSlug}/${componentSlug}/estimate/${activityId}`);
  return {};
}
