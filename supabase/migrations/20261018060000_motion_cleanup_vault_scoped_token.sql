-- Staging-only, least-privilege credential for the hourly 14-day media cleanup.
-- Do not put the Supabase service_role key into cron, GitHub or browser code.
-- The random token is minted inside Vault, and never returned to clients.
do $secret$
begin
 if not exists(select 1 from vault.secrets where name='mw_motion_staging_cleanup_token_v1') then
  perform vault.create_secret(
   encode(extensions.gen_random_bytes(32),'hex'),
   'mw_motion_staging_cleanup_token_v1',
   'Staging Motion Intelligence retention scheduler; internal only'
  );
 end if;
end $secret$;

-- Only a service-role Edge Function can validate the caller's shared token.
-- Revoke public execution; no decrypted token is returned by this function.
create or replace function public.mw_motion_staging_cleanup_authorized(candidate text)
returns boolean language sql stable security definer set search_path='' as $func$
 select coalesce(
  length(candidate)=64 and exists(
   select 1 from vault.decrypted_secrets
   where name='mw_motion_staging_cleanup_token_v1'
     and decrypted_secret=candidate
  ),false
 );
$func$;
revoke all on function public.mw_motion_staging_cleanup_authorized(text)
 from public,anon,authenticated;
grant execute on function public.mw_motion_staging_cleanup_authorized(text) to service_role;

-- The Edge Function has verify_jwt=false but authenticates every request
-- with the high-entropy Vault token via the restricted RPC above.
-- No service-role credential is sent over pg_net or stored in cron metadata.
select cron.schedule(
 'mw-motion-video-retention',
 '12 * * * *',
 $job$
 select net.http_post(
   url := 'https://uuggbmccnyswiwkjgydo.supabase.co/functions/v1/mw-motion-maintenance',
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'X-MW-Maintenance-Key',(
       select decrypted_secret from vault.decrypted_secrets
       where name='mw_motion_staging_cleanup_token_v1' limit 1
     )
   ),
   body := '{"execute":true,"dryRun":false,"limit":20}'::jsonb,
   timeout_milliseconds := 20000
 ) where exists(
   select 1 from vault.decrypted_secrets
   where name='mw_motion_staging_cleanup_token_v1'
     and length(decrypted_secret)=64
 );
 $job$
);
