import { getInviteToken } from "@/app/actions/invites";
import { createClient } from "@/lib/supabase/server";
import { InviteValidPage } from "./invite-valid";
import { InviteExpiredPage } from "./invite-expired";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  const [result, supabase] = await Promise.all([getInviteToken(token), createClient()]);
  const { data: { user } } = await supabase.auth.getUser();

  if (!result.data) {
    return (
      <div className="max-w-sm mx-auto w-full">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 text-center">
          <p className="font-mono text-sm text-white/40">This invite link is not valid.</p>
        </div>
      </div>
    );
  }

  if (result.expired) {
    return <InviteExpiredPage invite={result.data} />;
  }

  return <InviteValidPage invite={result.data} token={token} isAuthenticated={!!user} />;
}
