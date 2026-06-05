"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Budget, BudgetLineItem } from "@/types/database";

export type BudgetWithLineItems = { budget: Budget; lineItems: BudgetLineItem[] };

/**
 * Loads the single budget for a component, creating it on first access.
 * One budget per component is enforced by the `unique (component_id)` constraint.
 */
export async function getOrCreateBudget(
  componentId: string
): Promise<{ data?: BudgetWithLineItems; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  let { data: budget } = await supabase
    .from("budgets")
    .select("*")
    .eq("component_id", componentId)
    .maybeSingle();

  if (!budget) {
    const { data: created, error } = await supabase
      .from("budgets")
      .insert({ component_id: componentId, created_by: user.id })
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation — a concurrent request already created it
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("budgets").select("*").eq("component_id", componentId).single();
        budget = existing;
      } else {
        return { error: error.message };
      }
    } else {
      budget = created;
    }
  }
  if (!budget) return { error: "Failed to load budget" };

  const { data: lineItems } = await supabase
    .from("budget_line_items")
    .select("*")
    .eq("budget_id", budget.id)
    .order("section_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return {
    data: { budget: budget as Budget, lineItems: (lineItems ?? []) as BudgetLineItem[] },
  };
}

async function touchBudget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  budgetId: string,
) {
  await supabase.from("budgets").update({ updated_at: new Date().toISOString() }).eq("id", budgetId);
}

export async function addBudgetLineItem(
  budgetId: string,
  sectionType: "expense" | "revenue",
  eventSlug: string,
  componentSlug: string
): Promise<{ data?: BudgetLineItem; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: last } = await supabase
    .from("budget_line_items")
    .select("sort_order")
    .eq("budget_id", budgetId)
    .eq("section_type", sectionType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("budget_line_items")
    .insert({ budget_id: budgetId, section_type: sectionType, sort_order: (last?.sort_order ?? -1) + 1 })
    .select()
    .single();
  if (error) return { error: error.message };
  await touchBudget(supabase, budgetId);
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: data as BudgetLineItem };
}

export async function updateBudgetLineItem(
  id: string,
  updates: Partial<Pick<BudgetLineItem, "item_name" | "estimated_amount" | "actual_amount" | "status" | "notes">>,
  eventSlug: string,
  componentSlug: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("budget_line_items")
    .update(updates)
    .eq("id", id)
    .select("budget_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (data?.budget_id) await touchBudget(supabase, data.budget_id as string);
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return {};
}

export async function deleteBudgetLineItem(
  id: string,
  eventSlug: string,
  componentSlug: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("budget_line_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return {};
}

/**
 * Imports an approved estimate's rows into the budget as line items, tagged with the
 * source estimate + a durable source_label ("{Team} · {proposal name}"). Aggregating
 * estimates from multiple teams into one budget is the master-budget use case.
 */
export async function importEstimateIntoBudget(
  budgetId: string,
  estimateId: string,
  eventSlug: string,
  componentSlug: string
): Promise<{ data?: BudgetLineItem[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // 1. Load the estimate; require it to be approved.
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, status, component_id, qty_column_id, amount_column_id, proposal_name, proposal_number")
    .eq("id", estimateId)
    .maybeSingle();
  if (!estimate) return { error: "Estimate not found" };
  if (estimate.status !== "approved") return { error: "Estimate must be approved before importing" };

  // 2. Verify the estimate and the budget belong to the SAME event.
  const { data: budget } = await supabase.from("budgets").select("component_id").eq("id", budgetId).maybeSingle();
  if (!budget) return { error: "Budget not found" };
  const { data: budgetComp } = await supabase.from("components").select("event_id").eq("id", budget.component_id).maybeSingle();
  const { data: estComp } = await supabase.from("components").select("event_id, name").eq("id", estimate.component_id).maybeSingle();
  if (!budgetComp || !estComp || budgetComp.event_id !== estComp.event_id) {
    return { error: "Estimate is not in the same event as this budget" };
  }

  // 3. Load the estimate's columns, sections, line items.
  const [{ data: columns }, { data: sections }, { data: lineItems }] = await Promise.all([
    supabase.from("estimate_columns").select("id, name, col_type, sort_order").eq("estimate_id", estimateId).order("sort_order"),
    supabase.from("estimate_sections").select("id, section_type").eq("estimate_id", estimateId),
    supabase.from("estimate_line_items").select("section_id, cells, sort_order").eq("estimate_id", estimateId).order("sort_order"),
  ]);

  // Prefer the column literally named "Item"; fall back to the first text column by sort order.
  const cols = columns ?? [];
  const itemCol =
    cols.find((c) => c.name.trim().toLowerCase() === "item") ??
    cols.filter((c) => c.col_type === "text").sort((a, b) => a.sort_order - b.sort_order)[0];
  const qtyId = estimate.qty_column_id;
  const amtId = estimate.amount_column_id;
  const sectionType = new Map((sections ?? []).map((s) => [s.id, s.section_type as "expense" | "revenue"]));
  const proposalName = estimate.proposal_name || estimate.proposal_number;
  const sourceLabel = `${estComp.name} · ${proposalName}`;

  // Continue sort_order after the budget's existing rows in each section so imported rows
  // don't collide with manually-added ones.
  const { data: existingRows } = await supabase
    .from("budget_line_items")
    .select("section_type, sort_order")
    .eq("budget_id", budgetId);
  const nextSort = new Map<string, number>();
  for (const r of existingRows ?? []) {
    const st = r.section_type as string;
    nextSort.set(st, Math.max(nextSort.get(st) ?? -1, Number(r.sort_order)));
  }

  const rows = (lineItems ?? []).map((li) => {
    const cells = (li.cells ?? {}) as Record<string, string>;
    const qty = parseFloat((qtyId && cells[qtyId]) || "0");
    const amt = parseFloat((amtId && cells[amtId]) || "0");
    const estimated = isNaN(qty) || isNaN(amt) ? 0 : qty * amt;
    const st = sectionType.get(li.section_id) ?? "expense";
    const order = (nextSort.get(st) ?? -1) + 1;
    nextSort.set(st, order);
    return {
      budget_id: budgetId,
      section_type: st,
      item_name: (itemCol && cells[itemCol.id]) || "",
      estimated_amount: estimated || 0,
      actual_amount: 0,
      status: "estimated" as const,
      source_estimate_id: estimateId,
      source_label: sourceLabel,
      sort_order: order,
    };
  });

  if (rows.length === 0) return { data: [] };

  const { data: inserted, error } = await supabase.from("budget_line_items").insert(rows).select();
  if (error) return { error: error.message };
  await touchBudget(supabase, budgetId);
  revalidatePath(`/events/${eventSlug}/${componentSlug}`);
  return { data: (inserted ?? []) as BudgetLineItem[] };
}
