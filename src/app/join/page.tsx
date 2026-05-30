import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { JoinPageClient } from "./join-client";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function JoinPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { q } = await searchParams;

  // Get slot count
  const { count: pendingCount } = await supabase
    .from("join_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  // Get all requests for history display
  const { data: allRequests } = await supabase
    .from("join_requests")
    .select("*, organization:organization_id(id, name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <JoinPageClient
      initialQuery={q ?? ""}
      pendingCount={pendingCount ?? 0}
      allRequests={(allRequests ?? []) as Array<{
        id: string;
        organization_id: string;
        status: string;
        created_at: string;
        organization: { id: string; name: string; slug: string };
      }>}
    />
  );
}
