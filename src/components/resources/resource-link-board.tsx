"use client";

import { useState, useTransition } from "react";
import { Plus, Link } from "lucide-react";
import { ResourceLinkCard } from "./resource-link-card";
import { ResourceLinkModal } from "./resource-link-modal";
import { deleteResourceLink } from "@/app/actions/resources";
import type { ResourceLink } from "@/types/database";

interface ResourceLinkBoardProps {
  initialLinks: ResourceLink[];
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  isLoggedIn: boolean;
}

export function ResourceLinkBoard({
  initialLinks,
  componentId,
  eventSlug,
  componentSlug,
  isLoggedIn,
}: ResourceLinkBoardProps) {
  const [links, setLinks] = useState(initialLinks);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingLink(null);
    setModalOpen(true);
  }

  function openEdit(link: ResourceLink) {
    setEditingLink(link);
    setModalOpen(true);
  }

  function handleDelete(link: ResourceLink) {
    setDeletingId(link.id);
    setError(null);
    startTransition(async () => {
      const result = await deleteResourceLink(link.id, eventSlug, componentSlug);
      if (result?.error) {
        setError(result.error);
      } else {
        setLinks((prev) => prev.filter((l) => l.id !== link.id));
      }
      setDeletingId(null);
    });
  }

  if (!isLoggedIn) {
    return (
      <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
        <Link className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <p className="text-sm text-white/40">Sign in to manage resource links.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">
          {links.length} resource{links.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add resource
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {links.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
          <Link className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white mb-1">No resources yet</p>
          <p className="text-xs text-white/40 mb-4">
            Add links to documents, spreadsheets, designs, and other resources.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-white/70 text-xs hover:bg-white/[0.1] hover:text-white transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add resource
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((link) => (
            <ResourceLinkCard
              key={link.id}
              link={link}
              onEdit={openEdit}
              onDelete={handleDelete}
              isDeleting={deletingId === link.id}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <ResourceLinkModal
          key={editingLink?.id ?? "new"}
          open={modalOpen}
          onOpenChange={setModalOpen}
          componentId={componentId}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          editingLink={editingLink}
          onLinkCreated={(link) => setLinks((prev) => [...prev, link])}
          onLinkUpdated={(link) =>
            setLinks((prev) => prev.map((l) => (l.id === link.id ? link : l)))
          }
        />
      )}
    </div>
  );
}
