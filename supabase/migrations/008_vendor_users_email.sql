-- ============================================================
-- vendor_users.email -- PostgREST doesn't expose the auth schema,
-- so there's no way to join vendor_users -> auth.users.email from
-- the client for the admin staff-list UI. Denormalized here,
-- populated by the invite-vendor Netlify function at insert time.
-- ============================================================
alter table public.vendor_users add column email text;
