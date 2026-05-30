"use client";

import { useRef, useState, useTransition } from "react";
import {
  Folder, FolderOpen, File, FileText, FileImage, FileVideo,
  Upload, Plus, Trash2, Download, ChevronDown, ChevronRight,
} from "lucide-react";
import { createFolder, deleteFolder, uploadFile, deleteFile, getSignedUrl } from "@/app/actions/files";
import type { FolderWithFiles } from "@/types/database";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="w-4 h-4 text-white/30" />;
  if (mimeType.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-400" />;
  if (mimeType.startsWith("video/")) return <FileVideo className="w-4 h-4 text-purple-400" />;
  if (mimeType === "application/pdf" || mimeType.includes("text")) return <FileText className="w-4 h-4 text-orange-400" />;
  return <File className="w-4 h-4 text-white/30" />;
}

interface FilesTabProps {
  folders: FolderWithFiles[];
  componentId: string;
  eventSlug: string;
  componentSlug: string;
  isLoggedIn: boolean;
}

export function FilesTab({ folders: initialFolders, componentId, eventSlug, componentSlug, isLoggedIn }: FilesTabProps) {
  const [folders, setFolders] = useState(initialFolders);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialFolders.map((f) => f.id)));
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("name", newFolderName.trim());
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    startTransition(async () => {
      const result = await createFolder(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.data) {
        setFolders((prev) => [...prev, result.data]);
        setExpanded((prev) => new Set([...prev, result.data.id]));
        setNewFolderName("");
        setShowNewFolder(false);
      }
    });
  }

  async function handleDeleteFolder(folderId: string) {
    setDeletingId(folderId);
    setError(null);
    const result = await deleteFolder(folderId, eventSlug, componentSlug);
    if (result?.error) setError(result.error);
    else setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setDeletingId(null);
  }

  function handleUploadClick(folderId: string) {
    fileInputRefs.current[folderId]?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, folderId: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(folderId);
    setError(null);
    const formData = new FormData();
    formData.set("folder_id", folderId);
    formData.set("component_id", componentId);
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);
    formData.set("file", file);
    const result = await uploadFile(formData);
    if (result?.error) {
      setError(result.error);
    } else if (result?.data) {
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === folderId
            ? { ...folder, files: [...folder.files, result.data] }
            : folder
        )
      );
    }
    setUploadingId(null);
    e.target.value = "";
  }

  async function handleDeleteFile(fileId: string, storageKey: string) {
    setDeletingId(fileId);
    setError(null);
    const result = await deleteFile(fileId, storageKey, eventSlug, componentSlug);
    if (result?.error) {
      setError(result.error);
    } else {
      setFolders((prev) =>
        prev.map((folder) => ({
          ...folder,
          files: folder.files.filter((f) => f.id !== fileId),
        }))
      );
    }
    setDeletingId(null);
  }

  async function handleDownload(fileId: string, storageKey: string, fileName: string) {
    setDownloadingId(fileId);
    const result = await getSignedUrl(storageKey);
    if (result?.url) {
      const a = document.createElement("a");
      a.href = result.url;
      a.download = fileName;
      a.target = "_blank";
      a.click();
    } else {
      setError(result?.error ?? "Failed to get download link");
    }
    setDownloadingId(null);
  }

  if (!isLoggedIn) {
    return (
      <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
        <Folder className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <p className="text-sm text-white/40">Sign in to use the shared folder.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs text-white/40">
          {folders.length} folder{folders.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={() => setShowNewFolder(true)}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-white/70 text-xs hover:bg-white/[0.1] hover:text-white transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New folder
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <Folder className="w-4 h-4 text-white/40 shrink-0" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="h-8 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
          />
          <button
            type="submit"
            disabled={isPending || !newFolderName.trim()}
            className="inline-flex items-center h-8 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg font-semibold text-xs text-white transition-all disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
            className="inline-flex items-center h-8 px-3 bg-white/[0.06] border border-white/10 rounded-lg font-semibold text-xs text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
          >
            Cancel
          </button>
        </form>
      )}

      {folders.length === 0 && !showNewFolder && (
        <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
          <Folder className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white mb-1">No folders yet</p>
          <p className="text-xs text-white/40 mb-4">Create folders to organize files for this component.</p>
          <button
            onClick={() => setShowNewFolder(true)}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-white/70 text-xs hover:bg-white/[0.1] hover:text-white transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New folder
          </button>
        </div>
      )}

      <div className="space-y-2">
        {folders.map((folder) => {
          const isExpanded = expanded.has(folder.id);
          return (
            <div key={folder.id} className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.04] transition-colors">
                <button
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                  onClick={() => toggleFolder(folder.id)}
                >
                  {isExpanded
                    ? <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                    : <Folder className="w-4 h-4 text-amber-400 shrink-0" />}
                  <span className="text-sm font-semibold text-white truncate">{folder.name}</span>
                  <span className="text-xs text-white/30 ml-1 shrink-0">
                    {folder.files.length} file{folder.files.length !== 1 ? "s" : ""}
                  </span>
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-white/30 ml-auto shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-white/30 ml-auto shrink-0" />}
                </button>
                <button
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg border border-white/10 text-white/30 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all disabled:opacity-50"
                  disabled={deletingId === folder.id}
                  onClick={() => handleDeleteFolder(folder.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-white/[0.06]">
                  {folder.files.length === 0 ? (
                    <p className="text-xs text-white/30 px-4 py-3">No files yet.</p>
                  ) : (
                    <div className="divide-y divide-white/[0.04]">
                      {folder.files.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 px-4 py-2 hover:bg-white/[0.03] group transition-colors">
                          <FileIcon mimeType={file.mime_type} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                            <p className="text-xs text-white/30">
                              {formatBytes(file.file_size)}
                              {file.file_size ? " · " : ""}
                              {formatDate(file.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-white/[0.07] hover:text-white transition-all disabled:opacity-50"
                              disabled={downloadingId === file.id}
                              onClick={() => handleDownload(file.id, file.storage_key, file.name)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/10 text-white/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all disabled:opacity-50"
                              disabled={deletingId === file.id}
                              onClick={() => handleDeleteFile(file.id, file.storage_key)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-4 py-2 border-t border-white/[0.04]">
                    <input
                      type="file"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[folder.id] = el; }}
                      onChange={(e) => handleFileChange(e, folder.id)}
                    />
                    <button
                      className="inline-flex items-center gap-1.5 h-7 px-2 bg-white/[0.04] border border-white/10 rounded-lg font-semibold text-xs text-white/50 hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-50"
                      disabled={uploadingId === folder.id}
                      onClick={() => handleUploadClick(folder.id)}
                    >
                      <Upload className="w-3 h-3" />
                      {uploadingId === folder.id ? "Uploading..." : "Upload file"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
