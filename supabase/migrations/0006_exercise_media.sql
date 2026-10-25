-- Demo GIFs for exercises that are not in the bundled library.
--
-- "Build with AI" can name an exercise the library lacks and hand over a public
-- .gif of it. The server route (app/api/media/route.ts) fetches that file once,
-- checks it really is a GIF, and stores it here under the user's own folder, so
-- the app never hotlinks a third-party URL that can vanish or change.
--
-- The path lives on the exercise template it illustrates. Library exercises
-- keep using their bundled media and never set it.

alter table workout_templates
  add column if not exists media_path text;

-- Public read: a demo GIF is not personal data, and a public URL is what an
-- <img> can load without a signed-URL round trip. Writes stay per-user below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', true, 5242880, array['image/gif'])
on conflict (id) do nothing;

-- Every object sits under "<user id>/…". A user can write and delete only
-- inside their own folder.
create policy "exercise media: own folder insert" on storage.objects for insert
  with check (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exercise media: own folder update" on storage.objects for update
  using (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exercise media: own folder delete" on storage.objects for delete
  using (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exercise media: own folder read" on storage.objects for select
  using (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
