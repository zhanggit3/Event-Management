import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Estimate, EstimateColumn, EstimateSection, EstimateLineItem } from "@/types/database";
import { createEstimate, type EstimateWithDetails } from "@/app/actions/estimates";
import { EstimateEditor } from "@/components/estimate-editor";

interface PageProps {
  params: Promise<{ eventSlug: string; componentSlug: string; activityId: string }>;
}

export default async function EstimatePage({ params }: PageProps) {
  const { eventSlug, componentSlug, activityId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch event + component + activity
  const { data: event } = await supabase
    .from("events")
    .select("id, name, organization_id, event_date, address")
    .eq("slug", eventSlug)
    .single();
  if (!event) notFound();

  const { data: component } = await supabase
    .from("components")
    .select("id, name, slug")
    .eq("event_id", event.id)
    .eq("slug", componentSlug)
    .single();
  if (!component) notFound();

  const { data: activity } = await supabase
    .from("activities")
    .select("id, name")
    .eq("id", activityId)
    .single();
  if (!activity) notFound();

  // Fetch or create estimate
  const existingEstimate = await supabase
    .from("estimates")
    .select("*")
    .eq("activity_id", activityId)
    .maybeSingle();

  let estimateData: EstimateWithDetails;

  if (!existingEstimate.data) {
    // F-08: pass user.id so createEstimate doesn't need a second getUser() call
    const result = await createEstimate(activityId, component.id, event.organization_id, user.id, eventSlug, componentSlug);
    if (result.error || !result.data) notFound();
    estimateData = result.data;
  } else {
    // Fetch columns, sections, and line items
    const { data: columns } = await supabase
      .from("estimate_columns")
      .select("*")
      .eq("estimate_id", existingEstimate.data.id)
      .order("sort_order");

    const { data: sections } = await supabase
      .from("estimate_sections")
      .select("*")
      .eq("estimate_id", existingEstimate.data.id)
      .order("sort_order");

    const { data: lineItems } = await supabase
      .from("estimate_line_items")
      .select("*")
      .eq("estimate_id", existingEstimate.data.id)
      .order("sort_order");

    estimateData = {
      estimate: existingEstimate.data as Estimate,
      columns: (columns ?? []) as EstimateColumn[],
      sections: (sections ?? []).map(s => ({
        ...s,
        lineItems: (lineItems ?? []).filter(li => li.section_id === s.id) as EstimateLineItem[],
      })) as (EstimateSection & { lineItems: EstimateLineItem[] })[],
    };
  }

  return (
    <div className="min-h-screen bg-[#05050F]">
      {/* Toolbar */}
      <div className="border-b border-white/[0.06] bg-[#080814]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/events/${eventSlug}/${componentSlug}`}
              className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 hover:text-white/80 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <span className="text-white/30">{event.name}</span>
            <span className="text-white/20">/</span>
            <span className="text-white/30">{component.name}</span>
            <span className="text-white/20">/</span>
            <span className="text-white/50">{activity.name}</span>
            <span className="text-white/20">/</span>
            <span className="text-white/70 font-medium">Estimate</span>
          </div>
          <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.06] border border-white/10 text-white/50 text-xs hover:bg-white/[0.09] transition-all">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <EstimateEditor
          estimate={estimateData.estimate}
          columns={estimateData.columns}
          sections={estimateData.sections}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          activityId={activityId}
          eventDate={event.event_date ?? null}
          eventAddress={event.address ?? null}
        />
      </div>
    </div>
  );
}
