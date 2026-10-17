-- Approved policy: raw private recordings are deleted after 14 days,
-- while separately consented 41-week angle summaries expire after 330 days.
-- The maintenance Edge function validates service authorization and owns
-- storage deletion. Never delete storage.objects rows directly in SQL.
create extension if not exists pg_net with schema extensions;

-- An hourly, guarded scheduler. No network request is made until an
-- administrator has securely provisioned the STAGING service-role JWT in
-- Supabase Vault under the exact name below. Never commit that key.
select cron.schedule(
 'mw-motion-video-retention',
 '12 * * * *',
 $job$
 select net.http_post(
   url := 'https://uuggbmccnyswiwkjgydo.supabase.co/functions/v1/mw-motion-maintenance',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'Authorization','Bearer ' || (
       select decrypted_secret from vault.decrypted_secrets
       where name='mw_motion_staging_service_role_jwt'
       limit 1
     )
   ),
   body := '{"execute":true,"dryRun":false,"limit":20}'::jsonb,
   timeout_milliseconds := 20000
 )
 where exists (
   select 1 from vault.decrypted_secrets
   where name='mw_motion_staging_service_role_jwt'
     and length(decrypted_secret)>20
 );
 $job$
);
