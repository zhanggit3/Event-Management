"use client";

import { useRef, useState } from "react";
import {
  Folder, Upload, Download, Trash2, Pencil, Check, X, MoreVertical,
  FileText, ListChecks, Plus, ChevronRight, FolderPlus, LayoutGrid, List as ListIcon,
  HardDrive, FolderInput,
} from "lucide-react";
import type { LibraryFolder, LibraryFile } from "@/types/database";
import {
  createLibraryFolder, renameLibraryFolder, deleteLibraryFolder,
  recordLibraryFile, moveLibraryFile, deleteLibraryFile, getLibrarySignedUrl,
} from "@/app/actions/library";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { formatDate, cn } from "@/lib/utils";
import { MAX_LIBRARY_FILE_BYTES, MAX_LIBRARY_FILE_LABEL } from "@/lib/limits";
import { libraryStorageKey } from "@/lib/library-keys";
import { FromTasksPanel } from "./from-tasks-panel";

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let s = n, i = 0;
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
  return `${s.toFixed(i > 0 && s < 10 ? 1 : 0)} ${units[i]}`;
}

function folderPath(folders: LibraryFolder[], currentId: string | null): LibraryFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: LibraryFolder[] = [];
  let id = currentId;
  while (id) {
    const f = byId.get(id);
    if (!f) break;
    path.unshift(f);
    id = f.parent_folder_id;
  }
  return path;
}

export function MyItemsClient({
  organizationId,
  initialFolders,
  initialFiles,
}: {
  organizationId: string;
  initialFolders: LibraryFolder[];
  initialFiles: LibraryFile[];
}) {
  const [folders, setFolders] = useState<LibraryFolder[]>(initialFolders);
  const [files, setFiles] = useState<LibraryFile[]>(initialFiles);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [tab, setTab] = useState<"files" | "tasks">("files");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const path = folderPath(folders, currentFolderId);
  const subfolders = folders
    .filter((f) => f.parent_folder_id === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const visibleFiles = files.filter((f) => f.folder_id === currentFolderId);

  async function handleCreateFolder() {
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    const result = await createLibraryFolder(organizationId, newName.trim(), currentFolderId);
    if ("error" in result && result.error) setError(result.error);
    else if (result.data) setFolders((p) => [...p, result.data]);
    setNewName(""); setCreating(false); setBusy(false);
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    const result = await renameLibraryFolder(id, renameValue.trim());
    if ("error" in result && result.error) setError(result.error);
    else if (result.data) setFolders((p) => p.map((f) => (f.id === id ? result.data : f)));
    setRenamingId(null);
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm("Delete this folder and everything inside it?")) return;
    setBusy(true); setError(null);
    const result = await deleteLibraryFolder(id);
    if ("error" in result && result.error) { setError(result.error); setBusy(false); return; }
    const childrenOf = new Map<string, string[]>();
    for (const f of folders) {
      if (f.parent_folder_id) { const a = childrenOf.get(f.parent_folder_id) ?? []; a.push(f.id); childrenOf.set(f.parent_folder_id, a); }
    }
    const removed = new Set<string>(); const q = [id];
    while (q.length) { const x = q.shift()!; removed.add(x); q.push(...(childrenOf.get(x) ?? [])); }
    setFolders((p) => p.filter((f) => !removed.has(f.id)));
    setFiles((p) => p.filter((f) => !(f.folder_id && removed.has(f.folder_id))));
    setBusy(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files;
    if (!chosen || chosen.length === 0) return;
    setBusy(true); setError(null);
    const supabase = createBrowserSupabase();
    for (const file of Array.from(chosen)) {
      // Reject oversized files instantly, before attempting the upload.
      if (file.size > MAX_LIBRARY_FILE_BYTES) {
        setError(`"${file.name}" is ${formatBytes(file.size)} — over the ${MAX_LIBRARY_FILE_LABEL} upload limit.`);
        continue;
      }
      // Upload the file DIRECTLY to Storage (bypasses the 1 MB Server Action body limit),
      // then record just the metadata via a server action. The key is built locally —
      // recordLibraryFile re-validates that its first segment is this org.
      const key = libraryStorageKey(organizationId, currentFolderId, file.name);
      const { error: upErr } = await supabase.storage
        .from("library-files").upload(key, file, { contentType: file.type || undefined });
      if (upErr) { setError(upErr.message); continue; }

      const result = await recordLibraryFile(organizationId, currentFolderId, file.name, key, file.size, file.type || null);
      if ("error" in result && result.error) { setError(result.error); continue; }
      if (result.data) setFiles((p) => [result.data, ...p]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setBusy(false);
  }

  async function handleMove(fileId: string, targetFolderId: string | null) {
    const result = await moveLibraryFile(fileId, targetFolderId);
    if ("error" in result && result.error) setError(result.error);
    else if (result.data) setFiles((p) => p.map((f) => (f.id === fileId ? result.data : f)));
  }

  async function handleDeleteFile(file: LibraryFile) {
    const result = await deleteLibraryFile(file.id);
    if ("error" in result && result.error) setError(result.error);
    else setFiles((p) => p.filter((f) => f.id !== file.id));
  }

  async function handleDownload(file: LibraryFile) {
    const result = await getLibrarySignedUrl(file.storage_key);
    if (result.url) window.open(result.url, "_blank");
    else setError(result.error ?? "Could not generate download link");
  }

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">My Items</h1>
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
          <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={<HardDrive className="w-3.5 h-3.5" />}>My Drive</TabButton>
          <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={<ListChecks className="w-3.5 h-3.5" />}>From Tasks</TabButton>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {tab === "tasks" ? (
        <FromTasksPanel organizationId={organizationId} folders={folders} onSaved={(f) => setFiles((p) => [f, ...p])} />
      ) : (
        <>
          {/* Toolbar: breadcrumb + actions */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <nav className="flex items-center gap-1 text-sm min-w-0">
              <button onClick={() => setCurrentFolderId(null)}
                className={cn("flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-white/[0.06] transition-colors shrink-0",
                  currentFolderId === null ? "text-white font-semibold" : "text-white/50")}>
                <HardDrive className="w-4 h-4" /> My Drive
              </button>
              {path.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1 min-w-0">
                  <ChevronRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
                  <button onClick={() => setCurrentFolderId(f.id)}
                    className={cn("px-1.5 py-1 rounded-md hover:bg-white/[0.06] transition-colors truncate max-w-[160px]",
                      i === path.length - 1 ? "text-white font-semibold" : "text-white/50")}>
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
                <button onClick={() => setView("grid")} aria-label="Grid view"
                  className={cn("p-1.5 rounded-md transition-colors", view === "grid" ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/70")}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setView("list")} aria-label="List view"
                  className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/70")}>
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-sm transition-all">
                    <Plus className="w-4 h-4" /> New
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setCreating(true); setNewName(""); }}>
                    <FolderPlus className="w-4 h-4 mr-2" /> New folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" /> Upload files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />
            </div>
          </div>

          {subfolders.length === 0 && visibleFiles.length === 0 && !creating ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                <Folder className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">This folder is empty</h2>
              <p className="text-sm text-white/40 max-w-xs">
                Use “New” to add a folder or upload files, or import from the “From Tasks” tab.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Folders */}
              {(subfolders.length > 0 || creating) && (
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-2.5">Folders</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {creating && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-indigo-500/40 bg-white/[0.04]">
                        <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreating(false); }}
                          placeholder="Untitled folder"
                          className="h-6 w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none" />
                        <button onClick={handleCreateFolder} disabled={busy} className="text-emerald-400 disabled:opacity-50 shrink-0"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setCreating(false)} className="text-white/40 shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    )}
                    {subfolders.map((folder) => (
                      <div key={folder.id}
                        onClick={() => renamingId !== folder.id && setCurrentFolderId(folder.id)}
                        className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer">
                        <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                        {renamingId === folder.id ? (
                          <input autoFocus value={renameValue} onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRename(folder.id); if (e.key === "Escape") setRenamingId(null); }}
                            className="h-6 w-full bg-transparent text-sm text-white focus:outline-none" />
                        ) : (
                          <span className="text-sm text-white truncate flex-1">{folder.name}</span>
                        )}
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ItemMenu>
                            <DropdownMenuItem onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); }}>
                              <Pencil className="w-4 h-4 mr-2" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteFolder(folder.id)} className="text-red-400 focus:text-red-400">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </ItemMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Files */}
              {visibleFiles.length > 0 && (
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-2.5">Files</p>
                  {view === "grid" ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {visibleFiles.map((file) => (
                        <div key={file.id} className="group rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all overflow-hidden">
                          <div className="h-20 flex items-center justify-center bg-white/[0.02] border-b border-white/[0.05]">
                            <FileText className="w-7 h-7 text-white/30" />
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-white truncate" title={file.name}>{file.name}</p>
                              <p className="text-[10px] text-white/30 font-mono">{formatBytes(file.file_size)}</p>
                            </div>
                            <FileMenu file={file} folders={folders} onDownload={() => handleDownload(file)}
                              onMove={(t) => handleMove(file.id, t)} onDelete={() => handleDeleteFile(file)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/[0.07] divide-y divide-white/[0.04]">
                      {visibleFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                          <FileText className="w-4 h-4 text-white/40 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{file.name}</p>
                            <p className="text-[11px] text-white/30 font-mono">{formatBytes(file.file_size)} · {formatDate(file.created_at)}</p>
                          </div>
                          <FileMenu file={file} folders={folders} onDownload={() => handleDownload(file)}
                            onMove={(t) => handleMove(file.id, t)} onDelete={() => handleDeleteFile(file)} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ItemMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-white/40 hover:bg-white/[0.1] hover:text-white transition-all" aria-label="More options">
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileMenu({ file, folders, onDownload, onMove, onDelete }: {
  file: LibraryFile;
  folders: LibraryFolder[];
  onDownload: () => void;
  onMove: (targetFolderId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-white/40 hover:bg-white/[0.1] hover:text-white transition-all opacity-0 group-hover:opacity-100" aria-label="File options">
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onDownload}><Download className="w-4 h-4 mr-2" /> Download</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><FolderInput className="w-4 h-4 mr-2" /> Move to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
              <DropdownMenuItem disabled={file.folder_id === null} onClick={() => onMove(null)}>
                <HardDrive className="w-4 h-4 mr-2" /> My Drive
              </DropdownMenuItem>
              {folders.length > 0 && <DropdownMenuSeparator />}
              {folders.map((f) => (
                <DropdownMenuItem key={f.id} disabled={file.folder_id === f.id} onClick={() => onMove(f.id)}>
                  <Folder className="w-4 h-4 mr-2" /> {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all",
        active ? "bg-indigo-500/15 text-indigo-300" : "text-white/50 hover:text-white/80")}>
      {icon}{children}
    </button>
  );
}
