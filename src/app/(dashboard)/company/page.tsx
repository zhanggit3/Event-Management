import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/types/database";
import { ClientsView } from "./clients-view";

export default async function CompanyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve the active org — prefer a real (non-workspace) org, fall back to the workspace.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug, is_workspace)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) redirect("/");

  const nonWorkspaceMembership = memberships.find(
    (m) => (m.organizations as unknown as { is_workspace: boolean })?.is_workspace === false,
  );
  const firstMembership = nonWorkspaceMembership ?? memberships[0];
  const organization = firstMembership.organizations as unknown as { id: string };
  const isAdmin = firstMembership.role === "owner" || firstMembership.role === "admin";

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-full">
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <ClientsView
          organizationId={organization.id}
          isAdmin={isAdmin}
          currentUserId={user.id}
          clients={(clients ?? []) as Client[]}
        />
      </div>
    </div>
  );
}
