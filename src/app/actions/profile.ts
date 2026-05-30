"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const full_name = (formData.get("full_name") as string | null)?.trim() ?? "";
  const job_titles = formData.getAll("job_titles") as string[];

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name: full_name || "",
        job_titles: job_titles.length > 0 ? job_titles : [],
      },
      { onConflict: "id" }
    );

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
