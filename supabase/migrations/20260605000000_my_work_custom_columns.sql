-- My Work personal columns: a per-user annotation layer over the user's tasks.
-- Nothing here writes back to public.tasks — custom columns and their values are
-- pure side-data keyed by (user, column, task). All three tables are RLS-scoped to
-- auth.uid(), mirroring public.notifications.

-- 1. Custom column definitions (the headers the user adds via the "+" button).
CREATE TABLE public.my_work_columns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX my_work_columns_user_idx ON public.my_work_columns(user_id, created_at);

ALTER TABLE public.my_work_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_work_columns_select_own"
  ON public.my_work_columns FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "my_work_columns_insert_own"
  ON public.my_work_columns FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_work_columns_update_own"
  ON public.my_work_columns FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_work_columns_delete_own"
  ON public.my_work_columns FOR DELETE
  USING (user_id = auth.uid());

-- 2. Cell values: one row per non-empty (column, task) pair. The FK to tasks only
-- ties cleanup to task deletion; editing a cell never touches the task row.
CREATE TABLE public.my_work_cells (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  column_id   uuid        NOT NULL REFERENCES public.my_work_columns(id) ON DELETE CASCADE,
  task_id     uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  value       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (column_id, task_id)
);

CREATE INDEX my_work_cells_user_task_idx ON public.my_work_cells(user_id, task_id);

ALTER TABLE public.my_work_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_work_cells_select_own"
  ON public.my_work_cells FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "my_work_cells_insert_own"
  ON public.my_work_cells FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_work_cells_update_own"
  ON public.my_work_cells FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_work_cells_delete_own"
  ON public.my_work_cells FOR DELETE
  USING (user_id = auth.uid());

-- 3. Per-user layout: column order (built-in keys + "col:<uuid>" tokens), hidden
-- built-in keys, and persisted widths. One row per user.
CREATE TABLE public.my_work_view (
  user_id       uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  column_order  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  hidden        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  widths        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.my_work_view ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_work_view_select_own"
  ON public.my_work_view FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "my_work_view_insert_own"
  ON public.my_work_view FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_work_view_update_own"
  ON public.my_work_view FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "my_work_view_delete_own"
  ON public.my_work_view FOR DELETE
  USING (user_id = auth.uid());
