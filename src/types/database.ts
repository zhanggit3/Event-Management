export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at"> & { created_at?: string };
        Update: Partial<Omit<Profile, "id">>;
      };
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Organization, "id">>;
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Omit<OrganizationMember, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<OrganizationMember, "id">>;
      };
      events: {
        Row: Event;
        Insert: Omit<Event, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Event, "id">>;
      };
      components: {
        Row: Component;
        Insert: Omit<Component, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Component, "id">>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Task, "id">>;
      };
      notes: {
        Row: Note;
        Insert: Omit<Note, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Note, "id">>;
      };
      invite_token_components: {
        Row: InviteTokenComponent;
        Insert: Omit<InviteTokenComponent, "id"> & { id?: string };
        Update: Partial<Omit<InviteTokenComponent, "id">>;
      };
      event_member_components: {
        Row: EventMemberComponent;
        Insert: Omit<EventMemberComponent, "id" | "granted_at"> & { id?: string; granted_at?: string };
        Update: Partial<Omit<EventMemberComponent, "id">>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<Notification, 'id'>>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_titles: string[] | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  is_workspace: boolean;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  scope: "org" | "event" | "component";
  created_at: string;
}

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  address: string | null;
  status: "draft" | "active" | "completed" | "archived";
  created_by: string;
  created_at: string;
}

export interface Component {
  id: string;
  event_id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}


export interface Task {
  id: string;
  component_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigned_to: string | null;
  reporter_id: string | null;
  due_date: string | null;
  parent_task_id: string | null;
  activity_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type MyWorkRow = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  dueDate: string | null;
  lastModified: string;
  commentCount: number;
  assignee: { full_name: string; email: string; avatar_url: string | null } | null;
  reporter: { full_name: string; email: string; avatar_url: string | null } | null;
  event: { name: string; slug: string } | null;
  /** Deep link that opens this task/subtask's edit panel, or null if it can't be resolved. */
  href: string | null;
  /** Per-user custom column values for this task, keyed by my_work_columns.id. */
  customCells: Record<string, string>;
};

/** A user-defined personal column on the My Work table (text-only, private). */
export type MyWorkCustomColumn = { id: string; name: string };

/**
 * A user's personalized My Work column layout. `column_order` holds built-in keys
 * (e.g. "title") and custom-column tokens ("col:<uuid>"); `hidden` lists built-in
 * keys to hide; `widths` maps either kind of token to a pixel width.
 */
export type MyWorkViewConfig = {
  column_order: string[];
  hidden: string[];
  widths: Record<string, number>;
};

export interface Activity {
  id: string;
  component_id: string;
  name: string;
  description: string | null;
  color: string | null;
  status: "planned" | "active" | "in_progress" | "completed" | "on_hold" | "cancelled" | "archived";
  priority: "low" | "medium" | "high" | "critical" | null;
  start_date: string | null;
  due_date: string | null;
  owner_id: string | null;
  assignee_id: string | null;
  tags: string[];
  reporter_id: string | null;
  sort_order: number;
  template_type: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  component_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  storage_key: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  updated_at: string | null;
}

export type TaskCommentWithAuthor = TaskComment & {
  author: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
};

export type TaskAttachmentWithUploader = TaskAttachment & {
  uploader: Pick<Profile, "full_name" | "email"> | null;
};

export type EventWithComponents = Event & {
  components: Component[];
};

export type ComponentWithTasks = Component & {
  tasks: Task[];
  leads: (ComponentMember & { profile?: Profile })[];
};

export type TaskWithAssignee = Task & {
  assignee: Profile | null;
  creator: Profile;
};

export type NoteWithAuthor = Note & {
  author: Profile;
};

export type MemberWithProfile = OrganizationMember & {
  profile: Profile;
};

export interface InviteToken {
  id: string;
  token: string;
  organization_id: string;
  invited_by: string;
  email: string | null;
  role: "member" | "admin" | "lead";
  invite_type: "organization" | "event" | "component";
  event_id: string | null;
  component_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export type InviteTokenWithOrg = InviteToken & {
  organization: { id: string; name: string; slug: string };
  inviter: { full_name: string; email: string };
  event?: { id: string; name: string; slug: string } | null;
  component?: { id: string; name: string; slug: string } | null;
};

export interface EventMember {
  id: string;
  event_id: string;
  user_id: string;
  role: "member" | "lead";
  created_at: string;
}

export interface InviteTokenComponent {
  id: string;
  invite_token_id: string;
  component_id: string;
}

export interface EventMemberComponent {
  id: string;
  event_id: string;
  user_id: string;
  component_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface ComponentAccessRequest {
  id: string;
  component_id: string;
  requester_id: string;
  note: string | null;
  status: "pending" | "accepted" | "denied";
  responded_by: string | null;
  denial_reason: string | null;
  created_at: string;
  responded_at: string | null;
}

export type ComponentAccessRequestWithDetails = ComponentAccessRequest & {
  requester: Pick<Profile, "id" | "full_name" | "email">;
  component: Pick<Component, "id" | "name" | "slug">;
};

export interface JoinRequest {
  id: string;
  user_id: string;
  organization_id: string;
  status: "pending" | "approved" | "denied" | "blocked";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export type JoinRequestWithProfile = JoinRequest & {
  profile: { id: string; full_name: string; email: string };
  organization: { id: string; name: string; slug: string };
};

export interface BlockedUser {
  id: string;
  user_id: string;
  organization_id: string;
  blocked_by: string;
  created_at: string;
}

export type BlockedUserWithProfile = BlockedUser & {
  profile: { id: string; full_name: string; email: string };
  blocker: { full_name: string; email: string };
};

export interface ComponentMember {
  id: string;
  component_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role: "lead" | "member";
  created_at: string;
  is_guest?: boolean;
}

export interface ComponentFolder {
  id: string;
  component_id: string;
  name: string;
  parent_folder_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ComponentFile {
  id: string;
  folder_id: string;
  component_id: string;
  name: string;
  storage_key: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export type FolderWithFiles = ComponentFolder & {
  files: (ComponentFile & { uploader: Pick<Profile, "full_name" | "email"> | null })[];
};

export interface CalendarEvent {
  id: string;
  component_id: string;
  event_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
  location: string | null;
  color: string | null;
  created_by: string;
  created_at: string;
  component?: {
    name: string;
    color: string | null;
  };
}

// ── Component templates (ISSUE-012) ──────────────────────────────────────
// A template captures the structure of a component: activities → tasks → subtasks.
export type TemplateSubtask = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};
export type TemplateTaskNode = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  subtasks: TemplateSubtask[];
};
export type TemplateActivity = {
  name: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical" | null;
  tasks: TemplateTaskNode[];
};

export interface ComponentTemplate {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  // Flat top-level tasks — retained for the AddComponentDialog "Library" tab (backward compat).
  tasks_json: { title: string; description?: string; priority?: string }[];
  // Full nested structure (ISSUE-012).
  structure_json: TemplateActivity[];
  source_event_name: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Clients (ISSUE-011) — org-level Collaborators directory ───────────────
export interface Client {
  id: string;
  organization_id: string;
  client_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  projects: string | null;
  created_by: string | null;
  created_at: string;
}

// ── My Items library (ISSUE-013) ──────────────────────────────────────────
export interface LibraryFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_folder_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LibraryFile {
  id: string;
  organization_id: string;
  folder_id: string | null;
  name: string;
  storage_key: string;
  file_size: number | null;
  mime_type: string | null;
  source_type: "upload" | "task_attachment" | "estimate_snapshot";
  source_ref: string | null;
  created_by: string | null;
  created_at: string;
}

export type ResourceCategory =
  | "document"
  | "spreadsheet"
  | "design"
  | "project_management"
  | "communication"
  | "other";

export interface ResourceLink {
  id: string;
  component_id: string;
  title: string;
  url: string;
  category: ResourceCategory;
  description: string | null;
  added_by: string;
  created_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export type NotificationType =
  | 'mention_in_comment'
  | 'task_assigned'
  | 'task_comment_added'
  | 'task_attachment_added'
  | 'task_updated'
  | 'invite_accepted'
  | 'joined_via_invite';

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  related_table: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export type NotificationWithActor = Notification & {
  actor: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

export interface Estimate {
  id: string;
  activity_id: string;
  component_id: string;
  proposal_number: string;
  proposal_name: string | null;
  status: "draft" | "sent" | "approved" | "declined";
  qty_column_id: string | null;
  amount_column_id: string | null;
  created_by: string;
  last_modified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateColumn {
  id: string;
  estimate_id: string;
  name: string;
  col_type: "text" | "number" | "currency";
  sort_order: number;
}

export interface EstimateSection {
  id: string;
  estimate_id: string;
  name: string;
  section_type: "expense" | "revenue";
  sort_order: number;
}

export interface EstimateLineItem {
  id: string;
  section_id: string;
  estimate_id: string;
  cells: Record<string, string>;
  sort_order: number;
  created_at: string;
}

export interface Budget {
  id: string;
  component_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetLineItem {
  id: string;
  budget_id: string;
  section_type: "expense" | "revenue";
  item_name: string;
  estimated_amount: number;
  actual_amount: number;
  status: "estimated" | "quoted" | "committed" | "paid";
  notes: string | null;
  source_estimate_id: string | null;
  source_label: string | null;
  sort_order: number;
  created_at: string;
}
