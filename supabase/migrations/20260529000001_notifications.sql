CREATE TABLE public.notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  type          text        NOT NULL CHECK (type IN (
    'mention_in_comment',
    'task_assigned',
    'task_comment_added',
    'task_attachment_added',
    'task_updated',
    'invite_accepted',
    'joined_via_invite'
  )),
  title         text        NOT NULL,
  body          text,
  link          text,
  related_table text,
  related_id    uuid,
  is_read       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_idx
  ON public.notifications(recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (recipient_id = auth.uid());
