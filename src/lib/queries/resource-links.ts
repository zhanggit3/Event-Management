import { createClient } from "@/lib/supabase/server";
import type { ResourceLink } from "@/types/database";

export async function getResourceLinksByComponent(
  componentId: string
): Promise<ResourceLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resource_links")
    .select("*")
    .eq("component_id", componentId)
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as ResourceLink[];
}
