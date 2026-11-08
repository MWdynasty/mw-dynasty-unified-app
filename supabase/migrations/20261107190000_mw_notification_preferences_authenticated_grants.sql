-- Authenticated members may manage only their own notification preference row.
-- The table's existing RLS policies enforce user_id = auth.uid().
grant select, insert, update on table public.mw_notification_preferences to authenticated;
