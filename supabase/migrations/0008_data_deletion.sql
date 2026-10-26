-- 0008: "delete all my data", with a week to restore.
--
-- When the lifter asked for "delete all my data" — the clock for the week to
-- restore, and the flag every device reads to know the old data is archived.
-- There is no scheduled job: the week is enforced by the app on the first open
-- after it, so someone who never comes back keeps their archive until they do.
--
-- Optional for the app: without it, the profile still syncs and the request
-- stays on the device that made it.
alter table profiles
  add column if not exists deletion_requested_at timestamptz;

-- The hidden copy behind "delete all my data". Asking for deletion snapshots
-- everything into one row here and clears the live tables, so the lifter can
-- start fresh at once. For seven days they can restore it — merged with what
-- they logged since, or replacing it. After that, the app deletes this row the
-- next time it opens. One row per lifter: a second request replaces the first.
--
-- jsonb, not copies of each table: it is read back whole or not at all, and a
-- backup file already has exactly this shape (lib/sync.ts buildExport).
create table if not exists data_archives (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null,
  payload      jsonb not null
);

alter table data_archives enable row level security;

create policy "data archives: own row" on data_archives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
