"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateComponentMember, removeComponentMember } from "@/app/actions/components";
import { getInitials } from "@/lib/utils";
import type { ComponentMember } from "@/types/database";

const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";

interface TeamMemberListProps {
  members: ComponentMember[];
  eventSlug: string;
  componentSlug: string;
  isAdmin: boolean;
}

export function TeamMemberList({ members, eventSlug, componentSlug, isAdmin }: TeamMemberListProps) {
  const [editing, setEditing] = useState<ComponentMember | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openEdit(member: ComponentMember) {
    setEditing(member);
    setName(member.name);
    setEmail(member.email ?? "");
    setRole(member.role);
    setError(null);
  }

  function closeEdit() {
    setEditing(null);
    setName("");
    setEmail("");
    setRole("member");
    setError(null);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !name.trim()) return;
    setLoading(true);
    setError(null);
    const result = await updateComponentMember(
      editing.id,
      { name: name.trim(), email: email.trim() || null, role },
      eventSlug,
      componentSlug
    );
    if (result?.error) {
      setError(result.error);
    } else {
      closeEdit();
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDelete(memberId: string) {
    await removeComponentMember(memberId, eventSlug, componentSlug);
    router.refresh();
  }

  if (members.length === 0) {
    return (
      <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
        <p className="text-sm text-white/40">No team members assigned to this component yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-sm font-semibold text-indigo-300 shrink-0">
              {getInitials(member.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{member.name}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-white/40 capitalize">{member.role}</p>
                {member.is_guest && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-semibold uppercase tracking-wide">
                    External
                  </span>
                )}
              </div>
            </div>
            {isAdmin && !member.is_guest && (
              <div className="flex items-center gap-1">
                <button
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-white/[0.07] hover:text-white transition-all"
                  onClick={() => openEdit(member)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all"
                  onClick={() => handleDelete(member.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit team member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 pt-2">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="edit-name" className={labelClass}>Name</label>
              <input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                autoFocus
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="edit-role" className={labelClass}>Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="edit-email" className={labelClass}>Email</label>
              <input
                id="edit-email"
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
                onClick={closeEdit}
                className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
