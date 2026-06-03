import { Construction } from "lucide-react";

// Shared "coming soon" shell for Company sub-pages not yet built.
// Replaced by ISSUE-011 (Clients), ISSUE-012 (Templates), ISSUE-013 (My Items).
export function CompanyPlaceholder({ title }: { title: string }) {
  return (
    <div className="min-h-full">
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-10">{title}</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
            <Construction className="w-6 h-6 text-indigo-400" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Coming soon</h2>
          <p className="text-sm text-white/40 max-w-xs">
            {title} is under construction and will be available shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
