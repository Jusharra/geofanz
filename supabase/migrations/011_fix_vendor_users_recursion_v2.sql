-- ============================================================
-- 010 didn't actually fix the recursion in production -- a live
-- invite attempt still hit "infinite recursion detected in policy
-- for relation vendor_users" after 010 was applied. This migration
-- is what was actually run against the live database to resolve it
-- (verified by simulating the exact authenticated queries both ways
-- afterward, and by a real invite completing end-to-end).
--
-- Functional difference from 010: is_vendor_user() now takes an
-- optional argument (default auth.uid()) so it reads cleanly as
-- `not is_vendor_user()` in a USING clause -- same signature as
-- before, so CREATE OR REPLACE updates it in place rather than
-- creating a second overload. vendor_tokens_scoped went back to an
-- inline EXISTS rather than 010's my_vendor_id() helper (which is
-- left in place, unused, rather than dropped -- harmless, and
-- dropping a function during a live debugging session was more risk
-- than it was worth).
-- ============================================================
create or replace function public.is_vendor_user(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_users where user_id = p_user_id);
$$;

grant execute on function public.is_vendor_user to authenticated;

drop policy if exists admin_vendor_users on public.vendor_users;
create policy admin_vendor_users on public.vendor_users
  for all to authenticated
  using (not is_vendor_user())
  with check (not is_vendor_user());

drop policy if exists admin_tokens_full on public.redemption_tokens;
create policy admin_tokens_full on public.redemption_tokens
  for all to authenticated
  using (not is_vendor_user())
  with check (not is_vendor_user());

drop policy if exists vendor_tokens_scoped on public.redemption_tokens;
create policy vendor_tokens_scoped on public.redemption_tokens
  for select to authenticated
  using (exists (
    select 1 from vendor_users vu
    where vu.user_id = auth.uid() and vu.vendor_id = redemption_tokens.vendor_id
  ));
