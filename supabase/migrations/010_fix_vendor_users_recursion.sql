-- ============================================================
-- Fix: "infinite recursion detected in policy for relation
-- vendor_users"
--
-- admin_vendor_users (007) and admin_tokens_full/vendor_tokens_scoped
-- (007) all query vendor_users from inside a policy that applies TO
-- vendor_users (directly, or transitively when redemption_tokens'
-- policies subquery it) -- each check re-triggers RLS on
-- vendor_users, which re-runs the same check, forever.
--
-- Standard fix: move the lookup into a SECURITY DEFINER function.
-- It's owned by the migration role (same as the table), and Postgres
-- exempts a table's owner from its own RLS by default -- so the
-- function's internal query bypasses RLS entirely instead of
-- re-entering the policy that called it.
-- ============================================================
create or replace function public.is_vendor_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_users where user_id = p_user_id)
$$;

create or replace function public.my_vendor_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select vendor_id from vendor_users where user_id = auth.uid() and active
$$;

drop policy if exists admin_vendor_users on public.vendor_users;
create policy admin_vendor_users on public.vendor_users
  for all to authenticated
  using (not is_vendor_user(auth.uid()))
  with check (not is_vendor_user(auth.uid()));

drop policy if exists admin_tokens_full on public.redemption_tokens;
create policy admin_tokens_full on public.redemption_tokens
  for all to authenticated
  using (not is_vendor_user(auth.uid()))
  with check (not is_vendor_user(auth.uid()));

drop policy if exists vendor_tokens_scoped on public.redemption_tokens;
create policy vendor_tokens_scoped on public.redemption_tokens
  for select to authenticated
  using (vendor_id = my_vendor_id());
