"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  if (!name?.trim()) return { error: "Name is required" };

  const slug = slugify(name);

  // Atomic create (org + owner membership) via SECURITY DEFINER RPC. A plain
  // insert().select() fails RLS: the creator can't read the new row back until
  // they're a member, which is added in the same step. See migration
  // create_organization_with_owner_security_definer.
  const { error: orgError } = await supabase.rpc("create_organization_with_owner", {
    p_name: name.trim(),
    p_slug: slug,
    p_is_workspace: false,
  });

  if (orgError) return { error: orgError.message };

  revalidatePath("/");
  return { success: true };
}

export async function createWorkspace(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  if (!name?.trim()) return { error: "Workspace name is required" };

  // Prevent creating a second workspace
  const { data: memberOrgRows } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id);

  const memberOrgIds = (memberOrgRows ?? []).map((r) => r.organization_id);

  if (memberOrgIds.length > 0) {
    const { count } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("is_workspace", true)
      .in("id", memberOrgIds);

    if ((count ?? 0) > 0) return { error: "You already have a personal workspace" };
  }

  const slug = slugify(name) + "-" + user.id.slice(0, 8);

  // Atomic create via SECURITY DEFINER RPC — see createOrganization above.
  // Workspaces are excluded from the org search SELECT policy, so the creator
  // could never read the new workspace row back via a plain insert().select().
  const { error: orgError } = await supabase.rpc("create_organization_with_owner", {
    p_name: name.trim(),
    p_slug: slug,
    p_is_workspace: true,
  });

  if (orgError) return { error: orgError.message };

  revalidatePath("/");
  return { success: true };
}

export async function inviteMember(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const orgId = formData.get("organization_id") as string;
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const role = ((formData.get("role") as string) || "member") as "member" | "admin";

  if (!email) return { error: "Email is required" };

  // Verify caller is admin/owner
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Insufficient permissions" };
  }

  // Check if this email is already a member
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();

    if (existingMember) return { error: "This person is already a member of your organization" };
  }

  // Create invite token
  const { data: tokenData, error: tokenError } = await supabase
    .from("invite_tokens")
    .insert({
      organization_id: orgId,
      invited_by: user.id,
      email,
      role,
    })
    .select("token")
    .single();

  if (tokenError) return { error: tokenError.message };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = `${siteUrl}/invite/${tokenData.token}`;

  revalidatePath("/settings");
  return { success: true, inviteUrl, email };
}

export async function removeMember(memberId: string, orgId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}

export async function updateMemberRole(memberId: string, role: string, orgId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}
