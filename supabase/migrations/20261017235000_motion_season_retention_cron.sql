-- Staging only until pilot approval and production release.
-- Daily physical deletion of consented 330-day angle summaries; raw media
-- is managed separately by the service-authorized maintenance Edge function.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('mw-motion-season-retention','0 3 * * *',
  $$delete from public.motion_season_observations where expires_at <= now();$$
);
