"use client";

import { useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { createOrganization } from "@/app/actions/organizations";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateOrganizationForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const slug = slugify(name);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await (createOrganization as (fd: FormData) => Promise<{ error?: string } | void>)(fd);
      if (result && "error" in result && result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-8">
      <div className="w-full max-w-md">
        {/* Icon box */}
        <div className="flex justify-center mb-6">
          <div className="bg-[#00CC66] border-2 border-black w-16 h-16 rounded-none flex items-center justify-center shadow-[4px_4px_0px_0px_#000000]">
            <Building2 className="w-8 h-8 text-black" />
          </div>
        </div>

        {/* Step label */}
        <p className="text-center text-xs font-mono uppercase tracking-widest text-[#555555] mb-3">
          Step 1 of 1
        </p>

        {/* Heading */}
        <h1 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">
          Set Up Your Workspace
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="border-2 border-[#FF0000] bg-[#FFF0F0] p-3 text-sm font-mono text-[#FF0000]">
              {error}
            </div>
          )}

          {/* Org name */}
          <div className="space-y-2">
            <label htmlFor="org-name" className="block text-xs font-mono uppercase tracking-widest text-[#555555]">
              Organization Name
            </label>
            <input
              id="org-name"
              name="name"
              type="text"
              placeholder="e.g. Sunrise Nonprofit"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-11 w-full border-2 border-black rounded-none bg-white px-3 py-1 text-sm placeholder:text-[#999999] focus:outline-none focus:border-[#00CC66] focus:bg-[#E8FFF5] transition-colors"
            />
          </div>

          {/* Slug preview */}
          <div className="space-y-1">
            <label className="block text-xs font-mono uppercase tracking-widest text-[#555555]">
              Workspace URL (Preview)
            </label>
            <div className="flex h-9 w-full border-2 border-black rounded-none bg-[#F5F5F5] px-3 items-center font-mono text-sm text-[#555555] select-none">
              eventstack.app /&nbsp;
              <span className="text-black font-semibold">{slug || "your-org"}</span>
            </div>
            <p className="text-xs text-[#555555] italic">
              Slug is auto-generated · you can change it later
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="w-full h-11 bg-[#00CC66] border-2 border-black shadow-[4px_4px_0px_0px_#000000] rounded-none font-bold uppercase tracking-wide text-black hover:shadow-[2px_2px_0px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-[4px_4px_0px_0px_#000000] disabled:translate-x-0 disabled:translate-y-0"
          >
            {isPending ? "CREATING..." : "CREATE ORGANIZATION →"}
          </button>
        </form>
      </div>
    </div>
  );
}
