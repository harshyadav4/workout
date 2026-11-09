-- Exercise sections and inclusion choices live in the existing exercises JSON.
alter table public.session_templates
  add column if not exists optional boolean not null default false;

alter table public.scheduled_sessions
  add column if not exists optional boolean not null default false,
  add column if not exists phase_name text;
