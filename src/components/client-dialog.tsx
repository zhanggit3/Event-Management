"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { addClient, updateClient } from "@/app/actions/clients";
import type { Client } from "@/types/database";

const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";

interface ClientDialogProps {
  organizationId: string;
  /** When provided, the dialog is in edit mode; otherwise add mode. */
  client?: Client | null;
  onClose: () => void;
  onSaved: (client: Client) => void;
}

// Mounted only while open, so useState initializes from `client` on each open.
export function ClientDialog({ organizationId, client, onClose, onSaved }: ClientDialogProps) {
  const isEdit = !!client;
  const [clientName, setClientName] = useState(client?.client_name ?? "");
  const [companyName, setCompanyName] = useState(client?.company_name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [projects, setProjects] = useState(client?.projects ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("organization_id", organizationId);
    formData.set("client_name", clientName.trim());
    formData.set("company_name", companyName.trim());
    formData.set("email", email.trim());
    formData.set("phone", phone.trim());
    formData.set("projects", projects.trim());

    const result = isEdit
      ? await updateClient(client!.id, formData)
      : await addClient(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (result?.data) onSaved(result.data);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "Add client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <div>
            <label htmlFor="client-name" className={labelClass}>Client name</label>
            <input id="client-name" value={clientName} onChange={(e) => setClientName(e.target.value)}
              placeholder="Full name" required autoFocus className={inputClass} />
          </div>
          <div>
            <label htmlFor="client-company" className={labelClass}>Company name</label>
            <input id="client-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company" className={inputClass} />
          </div>
          <div>
            <label htmlFor="client-email" className={labelClass}>Email</label>
            <input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com" className={inputClass} />
          </div>
          <div>
            <label htmlFor="client-phone" className={labelClass}>Phone</label>
            <input id="client-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000" className={inputClass} />
          </div>
          <div>
            <label htmlFor="client-projects" className={labelClass}>Projects</label>
            <input id="client-projects" value={projects} onChange={(e) => setProjects(e.target.value)}
              placeholder="e.g. 3, or a note" className={inputClass} />
          </div>
          <DialogFooter>
            <button type="button" onClick={onClose}
              className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all">
              Cancel
            </button>
            <button type="submit" disabled={loading || !clientName.trim()}
              className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none">
              {loading ? "Saving..." : isEdit ? "Save changes" : "Add client"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
