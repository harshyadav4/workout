-- Schedules the two senders: rest alerts every 5 seconds, daily reminders
-- every minute (README › Rest alerts on a locked phone, › Reminders).
-- Run once in the SQL editor after `supabase functions deploy`.
-- Replace <CRON_SECRET> with the value set in `supabase secrets` — from the
-- repo, this prints it filled in:
--   sed "s#<CRON_SECRET>#$(grep CRON_SECRET .env.vapid.local | cut -d= -f2)#" supabase/cron.sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('send-rest-alerts')
where exists (select 1 from cron.job where jobname = 'send-rest-alerts');
select cron.unschedule('send-daily-reminders')
where exists (select 1 from cron.job where jobname = 'send-daily-reminders');

select cron.schedule(
  'send-rest-alerts',
  '5 seconds',
  $$ select net.http_post(
       url     := 'https://mjtzsmmkdlfzqhivfmsg.supabase.co/functions/v1/send-rest-alerts',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
       body    := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'send-daily-reminders',
  '* * * * *',
  $$ select net.http_post(
       url     := 'https://mjtzsmmkdlfzqhivfmsg.supabase.co/functions/v1/send-daily-reminders',
       headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
       body    := '{}'::jsonb
     ) $$
);
