-- ============================================================
-- INBOX_ACTIVITY -- notes and a status-change audit trail for
-- partner_leads and problem_reports. A single small log table rather
-- than one per entity type, since the shape (who/when/what changed/
-- optional note) is identical for both.
--
-- Every status-dropdown change in admin writes a row here automatically
-- (status set, note null) so the history exists with zero extra taps.
-- A freeform note (status null) is a separate, optional action.
-- ============================================================
create table public.inbox_activity (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('partner_lead', 'problem_report')),
  entity_id    uuid not null,
  status       text,       -- set = this row is a status change; null = a plain note
  note         text,
  created_by   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now()
);

create index idx_inbox_activity_entity on public.inbox_activity (entity_type, entity_id, created_at desc);

alter table public.inbox_activity enable row level security;

-- Same convention as partner_leads/problem_reports themselves: admin
-- (no vendor_users row) only, never a vendor.
create policy admin_read_inbox_activity on public.inbox_activity
  for select to authenticated using (not is_vendor_user());

create policy admin_write_inbox_activity on public.inbox_activity
  for insert to authenticated with check (not is_vendor_user());

grant select, insert on public.inbox_activity to authenticated;
