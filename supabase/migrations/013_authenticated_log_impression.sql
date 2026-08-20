-- ============================================================
-- Impressions only had an INSERT policy for `anon`. Anyone signed
-- in elsewhere (admin previewing the fan page, a vendor staff
-- account) shares the same origin's localStorage session, so their
-- browser sends an authenticated JWT instead of the anon key even
-- on the public page -- and RLS silently dropped every impression
-- for them, no matching INSERT policy existed for `authenticated`.
-- Impressions are telemetry, not privileged data; anyone should be
-- able to log one regardless of auth state.
--
-- Found via a real repro: this exact failure was hit live because
-- the browser doing the testing had an active /admin session, and
-- / and /admin share the same origin's localStorage.
-- ============================================================
create policy authenticated_log_impression on public.impressions
  for insert to authenticated with check (true);
