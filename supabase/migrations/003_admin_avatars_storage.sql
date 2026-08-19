-- ============================================================
-- ADMIN AVATARS -- storage bucket for the admin settings page.
-- Public read (avatar URLs are embedded directly in <img> tags),
-- writes restricted to the owning user's own folder
-- (avatars/{user_id}/...). Only relevant to /admin; fan-facing
-- data is untouched.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar_public_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

create policy "avatar_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
