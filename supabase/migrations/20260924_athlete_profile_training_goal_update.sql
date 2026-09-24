-- Athlete Profile save repair
-- Keep direct athlete updates narrowly scoped: authenticated athletes may update
-- only their own training_goal row, with ownership still enforced by existing RLS.

revoke update on table public.athletes from authenticated;
grant update (training_goal) on table public.athletes to authenticated;

-- Existing policy "athletes update own assessment profile" enforces
-- user_id = auth.uid() in both USING and WITH CHECK.
