import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccessibleTemplates } from "@/app/actions/components";
import { TemplatesManager } from "./templates-manager";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Templates across ALL the user's organizations (company-wide), each tagged with its
  // org and whether the user can manage it.
  const templates = await getAccessibleTemplates();

  return (
    <div className="min-h-full">
      <div className="px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Templates</h1>
          <p className="text-sm text-white/40 mt-1">
            Reusable component templates — activities, tasks, and subtasks you can drop into any event.
          </p>
        </div>
        <TemplatesManager templates={templates} />
      </div>
    </div>
  );
}
