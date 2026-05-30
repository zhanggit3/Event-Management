"use client";

import { useState } from "react";
import { Trash2, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { createNote, deleteNote } from "@/app/actions/tasks";
import { formatNoteTimestamp, getInitials } from "@/lib/utils";
import type { Note, Profile } from "@/types/database";

type NoteWithAuthor = Note & { author: Profile | null };

interface NoteSectionProps {
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  notes: NoteWithAuthor[];
  currentUserId: string;
}

export function NoteSection({
  componentId,
  eventSlug,
  componentSlug,
  notes: initialNotes,
  currentUserId,
}: NoteSectionProps) {
  const [notes, setNotes] = useState<NoteWithAuthor[]>(initialNotes);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("content", content.trim());
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    const result = await createNote(formData);

    if (result?.error) {
      setError(result.error);
    } else if (result?.data) {
      setNotes((prev) => [result.data as NoteWithAuthor, ...prev]);
      setContent("");
    }
    setLoading(false);
  }

  async function handleDelete(noteId: string) {
    await deleteNote(noteId, eventSlug, componentSlug);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
          <p className="text-sm text-white/40">No notes yet. Add the first one below.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => {
            const authorName = note.author?.full_name || note.author?.email || "Unknown";
            const initials = getInitials(authorName);
            return (
              <div key={note.id} className="group flex gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-semibold text-indigo-300 shrink-0 mt-0.5">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold text-white">{authorName}</span>
                    <span className="text-xs text-white/30">
                      {formatNoteTimestamp(note.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </div>
                {note.created_by === currentUserId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-white/40 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete note?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This note will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(note.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 pt-4 border-t border-white/[0.07]"
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 min-h-[60px] rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
        />
        <button
          type="submit"
          className="h-10 w-10 shrink-0 self-end flex items-center justify-center bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
          disabled={loading || !content.trim()}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
