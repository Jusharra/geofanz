-- ============================================================
-- Admin-only views were readable by signed-out visitors.
--
-- slot_availability (revenue per venue/event), recent_activity (the last
-- 300 fan/vendor events) and token_integrity (fraud signals) are plain
-- views owned by postgres with security_invoker off, so row-level security
-- on the tables underneath doesn't apply -- and Supabase's default grants
-- give `anon` SELECT on every new object in public. Anyone with the public
-- anon key (it ships in the site's JavaScript) could query them through
-- the REST API with no login.
--
-- campaign_report / campaign_hourly / venue_diagnostics are NOT affected:
-- they use security_invoker, so anon sees 0 rows.
--
-- Fix: take the grants away from anon, and leave signed-in users read-only.
-- The admin dashboard reads these as an authenticated user, so nothing in
-- the app changes.
-- ============================================================
revoke all on public.slot_availability, public.recent_activity, public.token_integrity from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.slot_availability, public.recent_activity, public.token_integrity
  from authenticated;
