"use client";

import { useState, useEffect, useRef } from "react";
import { X, Check, Plus, Trash2, Paperclip, Send, AtSign, Link2, Download, File } from "lucide-react";
import { updateTask, deleteTask } from "@/app/actions/tasks";
import { getTaskComments, createTaskComment, deleteTaskComment } from "@/app/actions/task-comments";
import { getTaskAttachments, createTaskAttachment, deleteTaskAttachment, getTaskAttachmentSignedUrl } from "@/app/actions/task-attachments";
import { createClient } from "@/lib/supabase/client";
import type { Task, Profile, Activity, TaskCommentWithAuthor, TaskAttachmentWithUploader } from "@/types/database";
import {
  labelCls,
  TaskWithAssignee, SubTask,
  formatTimestamp, isSafeUrl, renderBody,
  TaskFieldsGrid,
} from "@/components/task-panel-shared";
import { TaskCreatePanel } from "@/components/task-create-panel";

export interface TaskEditPanelProps {
  task: TaskWithAssignee;
  activities?: Activity[];
  members: Profile[];
  eventSlug: string;
  componentSlug: string;
  onClose: () => void;
  onTaskUpdate: (updated: Partial<Task>) => void;
  onTaskDelete: (taskId: string) => void;
}

export function TaskEditPanel({
  task, activities, members, eventSlug, componentSlug,
  onClose, onTaskUpdate, onTaskDelete,
}: TaskEditPanelProps) {
  const taskId = task.id;

  const [title, setTitle] = useState(task.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(task.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [status, setStatus] = useState<Task["status"]>(task.status);
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [reporterId, setReporterId] = useState(task.reporter_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date?.slice(0, 10) ?? "");
  const [activityId, setActivityId] = useState(task.activity_id ?? "");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [creatingSubTask, setCreatingSubTask] = useState(false);
  const [selectedSubTask, setSelectedSubTask] = useState<SubTask | null>(null);

  const [comments, setComments] = useState<TaskCommentWithAuthor[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [linkPopover, setLinkPopover] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<TaskAttachmentWithUploader[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setAssignedTo(task.assigned_to ?? "");
    setReporterId(task.reporter_id ?? "");
    setDueDate(task.due_date?.slice(0, 10) ?? "");
    setActivityId(task.activity_id ?? "");
    setLoadError(null);
    loadComments();
    loadAttachments();
    loadSubTasks();
  }, [task.id]);

  async function loadComments() {
    try { setComments((await getTaskComments(taskId)) ?? []); }
    catch { setComments([]); setLoadError("Failed to load comments. Please try again."); }
  }

  async function loadAttachments() {
    try { setAttachments((await getTaskAttachments(taskId)) ?? []); }
    catch { setAttachments([]); setLoadError("Failed to load attachments. Please try again."); }
  }

  async function loadSubTasks() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("tasks").select("*").eq("parent_task_id", taskId).order("created_at", { ascending: true });
      setSubTasks((data as SubTask[]) ?? []);
    } catch { setSubTasks([]); }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const updates: Partial<Task> = {};
    if (title.trim() !== task.title) updates.title = title.trim();
    if (description !== (task.description ?? "")) updates.description = description.trim() || null;
    if (status !== task.status) updates.status = status;
    if (priority !== task.priority) updates.priority = priority;
    if (assignedTo !== (task.assigned_to ?? "")) updates.assigned_to = assignedTo || null;
    if (reporterId !== (task.reporter_id ?? "")) updates.reporter_id = reporterId || null;
    if (dueDate !== (task.due_date?.slice(0, 10) ?? "")) updates.due_date = dueDate || null;
    if (activityId !== (task.activity_id ?? "")) updates.activity_id = activityId || null;
    if (Object.keys(updates).length === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await updateTask(taskId, updates, eventSlug, componentSlug);
    setSaving(false);
    if (result?.error) { setSaveError(result.error); return; }
    onTaskUpdate(updates);
  }

  async function handleDeleteTask() {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    const result = await deleteTask(taskId, eventSlug, componentSlug);
    if (result?.error) { setSaveError(result.error); return; }
    onTaskDelete(taskId);
    onClose();
  }

  // ── Sub-tasks ────────────────────────────────────────────────────────────────

  async function toggleSubTask(sub: SubTask) {
    const next = sub.status === "done" ? "todo" : "done";
    setSubTasks((prev) => prev.map((s) => s.id === sub.id ? { ...s, status: next as Task["status"] } : s));
    const result = await updateTask(sub.id, { status: next }, eventSlug, componentSlug);
    if (result?.error) setSubTasks((prev) => prev.map((s) => s.id === sub.id ? { ...s, status: sub.status } : s));
  }

  async function removeSubTask(sub: SubTask) {
    setSubTasks((prev) => prev.filter((s) => s.id !== sub.id));
    const result = await deleteTask(sub.id, eventSlug, componentSlug);
    if (result?.error) setSubTasks((prev) => [...prev, sub]);
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  const filteredMembers = mentionQuery !== null
    ? members.filter((m) => m.full_name.toLowerCase().includes(mentionQuery!.toLowerCase())).slice(0, 6)
    : [];

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredMembers[mentionIndex]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePostComment(); }
  }

  function handleCommentChange(val: string) {
    setCommentBody(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1 && val.slice(atIdx + 1).match(/^\w*$/)) {
      setMentionQuery(val.slice(atIdx + 1));
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(member: Profile) {
    const atIdx = commentBody.lastIndexOf("@");
    setCommentBody(`${commentBody.slice(0, atIdx)}@${member.full_name} `);
    setMentionQuery(null);
    setPendingMentions((prev) => [...new Set([...prev, member.id])]);
    setTimeout(() => commentInputRef.current?.focus(), 10);
  }

  function insertLink() {
    if (!linkText.trim() || !linkUrl.trim()) { setLinkPopover(false); return; }
    if (!isSafeUrl(linkUrl)) { setLinkError("URL must start with https:// or http://"); return; }
    setCommentBody((b) => b + `[${linkText.trim()}](${linkUrl.trim()})`);
    setLinkText(""); setLinkUrl(""); setLinkError(null); setLinkPopover(false);
    setTimeout(() => commentInputRef.current?.focus(), 10);
  }

  async function handlePostComment() {
    if (!commentBody.trim() || postingComment) return;
    setPostingComment(true);
    setCommentError(null);
    const result = await createTaskComment(taskId, commentBody, pendingMentions, eventSlug, componentSlug);
    setPostingComment(false);
    if (result?.data) {
      setComments((prev) => [result.data as TaskCommentWithAuthor, ...prev]);
      setCommentBody("");
      setPendingMentions([]);
    } else {
      setCommentError(result?.error ?? "Failed to post comment. Please try again.");
    }
  }

  async function handleDeleteComment(comment: TaskCommentWithAuthor) {
    const result = await deleteTaskComment(comment.id, eventSlug, componentSlug);
    if (result?.error) { setCommentError(result.error); return; }
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
  }

  // ── Attachments ───────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setSaveError(null);
    const supabase = createClient();
    const key = `${taskId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("task-attachments").upload(key, file);
    if (uploadError) {
      setSaveError(uploadError.message ?? "Failed to upload file.");
    } else {
      const result = await createTaskAttachment(taskId, file.name, key, file.size, file.type, eventSlug, componentSlug);
      if (result?.data) setAttachments((prev) => [...prev, result.data as TaskAttachmentWithUploader]);
      else setSaveError(result?.error ?? "Failed to save attachment.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDownload(att: TaskAttachmentWithUploader) {
    const url = await getTaskAttachmentSignedUrl(att.storage_key);
    if (url) window.open(url, "_blank");
  }

  async function handleDeleteAttachment(att: TaskAttachmentWithUploader) {
    const result = await deleteTaskAttachment(att.id, att.storage_key, eventSlug, componentSlug);
    if (result?.error) { setSaveError(result.error); return; }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[640px] max-h-[90vh] bg-[#0D0D1C] border border-white/10 rounded-2xl z-50 flex flex-col overflow-hidden shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Task detail</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleDeleteTask}
              className="h-8 px-2.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs font-semibold text-white/50 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 flex items-center gap-1 transition-all"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 bg-white/[0.06] border border-white/10 rounded-lg hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-6">

            {saveError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-sm text-red-400">{saveError}</p>
              </div>
            )}

            {/* Title */}
            <div>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingTitle(false);
                    if (e.key === "Escape") { setTitle(task.title); setEditingTitle(false); }
                  }}
                  placeholder="Task title *"
                  className="w-full text-xl font-bold text-white border-0 border-b border-indigo-500/50 bg-transparent focus:outline-none pb-1 placeholder:text-white/20"
                />
              ) : (
                <h1
                  onClick={() => setEditingTitle(true)}
                  className="text-xl font-bold text-white cursor-text hover:text-white/70 transition-colors"
                >
                  {title || <span className="text-white/20">Untitled</span>}
                </h1>
              )}
            </div>

            <TaskFieldsGrid
              status={status} priority={priority}
              assignedTo={assignedTo} reporterId={reporterId}
              dueDate={dueDate} activityId={activityId}
              activities={activities} members={members}
              onStatusChange={setStatus} onPriorityChange={setPriority}
              onAssigneeChange={setAssignedTo} onReporterChange={setReporterId}
              onDueDateChange={setDueDate} onActivityChange={setActivityId}
            />

            {/* Description */}
            <div>
              <label className={labelCls}>Description</label>
              {editingDesc ? (
                <textarea
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => setEditingDesc(false)}
                  rows={4}
                  placeholder="Add a description…"
                  className="w-full rounded-xl border border-indigo-500/40 bg-indigo-500/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-all"
                />
              ) : (
                <div
                  onClick={() => setEditingDesc(true)}
                  className="min-h-[60px] rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm cursor-text hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-all"
                >
                  {description
                    ? <p className="whitespace-pre-wrap text-white/70">{description}</p>
                    : <p className="text-white/25">Add a description…</p>}
                </div>
              )}
            </div>

            {/* Sub-tasks — hidden for sub-tasks themselves (no nesting) */}
            {!task.parent_task_id && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls}>
                    Sub-tasks {subTasks.length > 0 && `(${subTasks.filter(s => s.status === "done").length}/${subTasks.length})`}
                  </label>
                  <button onClick={() => setCreatingSubTask(true)} className="flex items-center gap-1 text-xs text-white/40 hover:text-indigo-400 transition-colors">
                    <Plus className="w-3 h-3" />Add
                  </button>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
                  {subTasks.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.05] last:border-b-0 group/sub hover:bg-white/[0.03] transition-colors">
                      <button
                        onClick={() => toggleSubTask(sub)}
                        className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all border ${sub.status === "done" ? "bg-emerald-500/20 border-emerald-500/40" : "border-white/20 hover:border-white/40 bg-transparent"}`}
                      >
                        {sub.status === "done" && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                      </button>
                      <button onClick={() => setSelectedSubTask(sub)} className={`flex-1 text-sm text-left cursor-pointer hover:text-indigo-300 transition-colors ${sub.status === "done" ? "line-through text-white/30" : "text-white/70"}`}>
                        {sub.title}
                      </button>
                      <button onClick={() => removeSubTask(sub)} className="opacity-0 group-hover/sub:opacity-100 transition-opacity text-white/30 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {subTasks.length === 0 && (
                    <p className="text-xs text-white/25 text-center py-3">No sub-tasks yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Attachments {attachments.length > 0 && `(${attachments.length})`}</label>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1 text-xs text-white/40 hover:text-indigo-400 transition-colors disabled:opacity-50">
                  <Paperclip className="w-3 h-3" />{uploading ? "Uploading…" : "Attach"}
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
              </div>
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.05] last:border-b-0 group/att hover:bg-white/[0.03] transition-colors">
                    <File className="w-4 h-4 shrink-0 text-white/30" />
                    <span className="flex-1 text-sm text-white/70 truncate">{att.file_name}</span>
                    {att.file_size && <span className="text-xs text-white/30">{Math.round(att.file_size / 1024)}KB</span>}
                    <button onClick={() => handleDownload(att)} className="text-white/30 hover:text-indigo-400 transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteAttachment(att)} className="opacity-0 group-hover/att:opacity-100 transition-opacity text-white/30 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {attachments.length === 0 && (
                  <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 text-xs text-white/25 hover:text-white/50 hover:bg-white/[0.03] transition-colors rounded-xl">
                    Click to attach a file
                  </button>
                )}
              </div>
            </div>

            {loadError && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{loadError}</p>
              </div>
            )}

            {/* Comments */}
            <div>
              <label className={labelCls}>Comments {comments.length > 0 && `(${comments.length})`}</label>

              <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden mb-3 relative">
                <div className="relative">
                  <textarea
                    ref={commentInputRef}
                    value={commentBody}
                    onChange={(e) => handleCommentChange(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Add a comment… Use @name to mention, Cmd+Enter to post"
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm text-white bg-transparent border-0 focus:outline-none resize-none placeholder:text-white/25"
                  />
                  {mentionQuery !== null && filteredMembers.length > 0 && (
                    <div className="absolute left-3 bottom-full mb-1 w-56 bg-[#0D0D1C] border border-white/10 rounded-xl shadow-2xl shadow-black/60 z-10 overflow-hidden">
                      {filteredMembers.map((m, i) => (
                        <button key={m.id} onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === mentionIndex ? "bg-indigo-500/20 text-indigo-300" : "text-white/70 hover:bg-white/[0.07]"}`}>
                          <AtSign className="w-3 h-3 text-indigo-400" />
                          {m.full_name || m.email}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 px-2 py-1.5 border-t border-white/[0.06] bg-white/[0.02]">
                  <div className="relative">
                    <button onClick={() => setLinkPopover((v) => !v)} title="Insert link" className="h-7 w-7 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.07] hover:text-white/70 transition-all">
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    {linkPopover && (
                      <div className="absolute left-0 bottom-full mb-1 w-64 bg-[#0D0D1C] border border-white/10 rounded-xl shadow-2xl shadow-black/60 p-3 z-10 space-y-2">
                        <input autoFocus value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Display text"
                          className="w-full text-xs rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 transition-all" />
                        <input value={linkUrl} onChange={(e) => { setLinkUrl(e.target.value); if (linkError) setLinkError(null); }} placeholder="https://…"
                          className="w-full text-xs rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 transition-all"
                          onKeyDown={(e) => { if (e.key === "Enter") insertLink(); }} />
                        {linkError && <p className="text-[11px] text-red-400">{linkError}</p>}
                        <button onClick={insertLink} className="w-full h-7 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg text-xs font-semibold text-white">Insert</button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { const next = commentBody + "@"; setCommentBody(next); handleCommentChange(next); setTimeout(() => commentInputRef.current?.focus(), 10); }}
                    title="Mention someone"
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.07] hover:text-white/70 transition-all"
                  >
                    <AtSign className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1" />
                  <button onClick={handlePostComment} disabled={!commentBody.trim() || postingComment}
                    className="h-7 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg text-xs font-semibold text-white flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none transition-all">
                    <Send className="w-3 h-3" />Post
                  </button>
                </div>
              </div>

              {commentError && <p className="text-xs text-red-400 px-1 mb-2">{commentError}</p>}

              <div className="space-y-3">
                {comments.length === 0 && <p className="text-xs text-white/25 text-center py-2">No comments yet</p>}
                {comments.map((c) => (
                  <div key={c.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 group/comment">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white/80">{c.author.full_name || c.author.email}</span>
                        <span className="text-xs text-white/30">{formatTimestamp(c.created_at)}</span>
                      </div>
                      <button onClick={() => handleDeleteComment(c)} className="opacity-0 group-hover/comment:opacity-100 transition-opacity text-white/30 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm text-white/70 whitespace-pre-wrap">{renderBody(c.body)}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Nested sub-task create panel */}
      {creatingSubTask && (
        <TaskCreatePanel
          componentId={task.component_id}
          defaultActivityId={task.activity_id ?? undefined}
          parentTaskId={taskId}
          activities={activities}
          members={members}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onClose={() => setCreatingSubTask(false)}
          onTaskCreated={(newSub) => {
            setSubTasks((prev) => [...prev, newSub as SubTask]);
            setCreatingSubTask(false);
          }}
        />
      )}

      {/* Nested sub-task edit panel */}
      {selectedSubTask && (
        <TaskEditPanel
          task={selectedSubTask as TaskWithAssignee}
          activities={activities}
          members={members}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onClose={() => setSelectedSubTask(null)}
          onTaskUpdate={(updates) => {
            setSubTasks((prev) => prev.map((s) => s.id === selectedSubTask.id ? { ...s, ...updates } : s));
          }}
          onTaskDelete={(id) => {
            setSubTasks((prev) => prev.filter((s) => s.id !== id));
            setSelectedSubTask(null);
          }}
        />
      )}
    </>
  );
}
