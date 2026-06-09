import { createClient } from "@/lib/supabase/server";
import { NewEventForm } from "./NewEventForm";
import { getOrgTemplates } from "@/app/actions/components";
import type { ComponentTemplate } from "@/types/database";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgId = "no-org";
  let templates: ComponentTemplate[] = [];

  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (membership) {
      orgId = membership.organization_id;
      templates = await getOrgTemplates(orgId);
    }
  }

  return <NewEventForm orgId={orgId} templates={templates} />;
}
