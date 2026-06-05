import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LibraryFolder, LibraryFile } from "@/types/database";
import { MyItemsClient } from "./my-items-client";

export default async function MyItemsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  const [{ data: folders }, { data: files }] = await Promise.all([
    supabase.from("library_folders").select("*").eq("organization_id", organization.id).order("name"),
    supabase.from("library_files").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="min-h-full">
      <div className="px-8 py-8">
        <MyItemsClient
          organizationId={organization.id}
          initialFolders={(folders ?? []) as LibraryFolder[]}
          initialFiles={(files ?? []) as LibraryFile[]}
        />
      </div>
    </div>
  );
}
