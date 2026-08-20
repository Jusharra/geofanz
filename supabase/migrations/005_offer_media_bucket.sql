-- ============================================================
-- OFFER-MEDIA storage bucket -- for offers.media_url (images) and
-- hosted video_url/video_poster_url. Same public-read pattern as the
-- avatars bucket, but writable by any authenticated admin rather than
-- scoped to auth.uid() -- this app has a single shared admin model,
-- same as the admin_all_* table policies in 001.
--
-- 10MB bucket ceiling; tighter limits (images ~3MB, hosted video ~8MB
-- per CLAUDE.md) are enforced client-side in the admin upload widget.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'offer-media', 'offer-media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do nothing;

create policy offer_media_public_read on storage.objects
  for select to public using (bucket_id = 'offer-media');

create policy offer_media_authenticated_write on storage.objects
  for insert to authenticated with check (bucket_id = 'offer-media');

create policy offer_media_authenticated_update on storage.objects
  for update to authenticated using (bucket_id = 'offer-media');

create policy offer_media_authenticated_delete on storage.objects
  for delete to authenticated using (bucket_id = 'offer-media');
