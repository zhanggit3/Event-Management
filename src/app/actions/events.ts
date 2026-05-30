"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { createEstimate } from "@/app/actions/estimates";

export async function createEvent(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const eventDate = formData.get("event_date") as string;
  const address = formData.get("address") as string;
  const orgId = formData.get("organization_id") as string;

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

  // Auto-create Finance component on every new event
  const { data: financeComponent } = await supabase
    .from("components")
    .insert({
      event_id: event.id,
      name: "Finance",
      slug: "finance",
      icon: "💰",
      color: "#10b981",
      sort_order: 0,
      is_active: true,
    })
    .select()
    .single();

  // Auto-create Estimate activity inside Finance
  if (financeComponent) {
    const { data: estimateActivity } = await supabase
      .from("activities")
      .insert({
        component_id: financeComponent.id,
        name: "Estimate",
        description: "Event cost and revenue estimate",
        color: "#6366f1",
        status: "active",
        tags: [],
        sort_order: 0,
        reporter_id: user?.id ?? null,
      })
      .select()
      .single();

    // Seed the estimate sheet for that activity
    if (estimateActivity && user) {
      await createEstimate(
        estimateActivity.id,
        financeComponent.id,
        orgId,
        user.id,
        event.slug,
        "finance"
      );
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
