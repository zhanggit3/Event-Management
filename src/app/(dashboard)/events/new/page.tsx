import { createClient } from "@/lib/supabase/server";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgId = "no-org";

  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (membership) orgId = membership.organization_id;
  }

  return <NewEventForm orgId={orgId} />;
}
