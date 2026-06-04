"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/types/database";

export async function addClient(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const organizationId = formData.get("organization_id") as string;
  const clientName = (formData.get("client_name") as string)?.trim();
  const companyName = (formData.get("company_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const projects = (formData.get("projects") as string)?.trim();

  if (!clientName) return { error: "Client name is required" };
  if (!organizationId) return { error: "Missing organization" };

  // Re-verify membership server-side — never trust the client-supplied organization_id.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not authorized" };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      organization_id: organizationId,
      client_name: clientName,
      company_name: companyName || null,
      email: email || null,
      phone: phone || null,
      projects: projects || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/company");
  return { data: data as Client };
}

export async function updateClient(clientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const clientName = (formData.get("client_name") as string)?.trim();
  const companyName = (formData.get("company_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const projects = (formData.get("projects") as string)?.trim();

  if (!clientName) return { error: "Client name is required" };

  // RLS enforces that only an org admin or the client's creator can update.
  const { data, error } = await supabase
    .from("clients")
    .update({
      client_name: clientName,
      company_name: companyName || null,
      email: email || null,
      phone: phone || null,
      projects: projects || null,
    })
    .eq("id", clientId)
    .select()
    .single();

  if (error) return { error: error.message };
  if (!data) return { error: "Client not found or not permitted" };

  revalidatePath("/company");
  return { data: data as Client };
}

export async function deleteClient(clientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // RLS enforces org-admin-only delete.
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/company");
  return { success: true };
}
