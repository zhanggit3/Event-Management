-- The handle_new_user() trigger (SECURITY DEFINER) inserts into profiles on signup.
-- Supabase's postgres role does not reliably bypass RLS, so without an INSERT policy
-- the trigger fails with "Database error creating new user".

create policy "Allow profile creation on signup"
  on public.profiles
  for insert
  with check (true);
