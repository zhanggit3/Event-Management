import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 400 });

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invite_tokens")
    .select("email, role, expires_at, used_at, organization:organization_id(id, name, slug)")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expired = !!data.used_at || new Date(data.expires_at) < new Date();
  if (expired) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  const org = data.organization as unknown as { id: string; name: string; slug: string };

  return NextResponse.json({
    orgName: org.name,
    orgId: org.id,
    role: data.role,
    email: data.email,
  });
}
