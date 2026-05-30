"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addComponentMember } from "@/app/actions/components";

const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";

interface AddMemberDialogProps {
  componentId: string;
  eventSlug: string;
  componentSlug: string;
}

export function AddMemberDialog({ componentId, eventSlug, componentSlug }: AddMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClose() {
    setOpen(false);
    setName("");
    setEmail("");
    setRole("member");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("name", name.trim());
    formData.set("email", email.trim());
    formData.set("role", role);
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    const result = await addComponentMember(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      handleClose();
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-white/70 text-xs hover:bg-white/[0.1] hover:text-white transition-all"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="member-name" className={labelClass}>Name</label>
              <input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                autoFocus
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="member-role" className={labelClass}>Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="member-email" className={labelClass}>Email</label>
              <input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={inputClass}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? "Adding..." : "Add member"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
