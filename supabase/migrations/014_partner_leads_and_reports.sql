-- ============================================================
-- PARTNER_LEADS -- /partner form submissions.
-- PROBLEM_REPORTS -- /report form submissions.
--
-- Both are public-insert (fans/vendors aren't authenticated), admin-
-- read (site admin only -- vendor_users staff never see these, same
-- pattern as everywhere else internal).
-- ============================================================
create table public.partner_leads (
  id              uuid primary key default gen_random_uuid(),
  business_name   text not null,
  contact_name    text not null,
  contact_info    text not null,        -- phone or email, freeform
  sells           text,                 -- "what you sell"
  event_interest  text,                 -- which event/date they want in
  status          text not null default 'new' check (status in ('new','contacted','converted','declined')),
  created_at      timestamptz not null default now()
);

create index idx_partner_leads_status on public.partner_leads (status, created_at desc);

alter table public.partner_leads enable row level security;

create policy submit_partner_lead on public.partner_leads
  for insert to anon, authenticated with check (true);

create policy admin_read_partner_leads on public.partner_leads
  for select to authenticated using (not is_vendor_user());

create policy admin_update_partner_leads on public.partner_leads
  for update to authenticated using (not is_vendor_user()) with check (not is_vendor_user());

grant select, insert, update on public.partner_leads to anon, authenticated;

-- ------------------------------------------------------------
create table public.problem_reports (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('no_deals','code_wont_scan','vendor_refused','site_down','other')),
  details       text,
  contact_info  text,                   -- optional
  session_id    uuid,                   -- reused from the fan's existing session, if present
  venue_id      uuid references public.venues(id) on delete set null,
  status        text not null default 'new' check (status in ('new','investigating','resolved')),
  created_at    timestamptz not null default now()
);

create index idx_problem_reports_status on public.problem_reports (status, created_at desc);

alter table public.problem_reports enable row level security;

create policy submit_problem_report on public.problem_reports
  for insert to anon, authenticated with check (true);

create policy admin_read_problem_reports on public.problem_reports
  for select to authenticated using (not is_vendor_user());

create policy admin_update_problem_reports on public.problem_reports
  for update to authenticated using (not is_vendor_user()) with check (not is_vendor_user());

grant select, insert, update on public.problem_reports to anon, authenticated;
