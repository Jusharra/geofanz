-- ============================================================
-- Vendor report emailing -- admin sets a cadence per vendor, a
-- scheduled function sends campaign_report numbers on that cadence,
-- and the same code path powers an admin "Send now" button for the
-- one-off case (a vendor calls and wants their numbers today).
-- ============================================================
alter table public.vendors
  add column report_frequency text not null default 'none'
    check (report_frequency in ('none', 'weekly', 'monthly')),
  add column last_report_sent_at timestamptz;

comment on column public.vendors.report_frequency is
  'none = admin only sends on request via "Send now". weekly/monthly = the scheduled-vendor-reports function emails campaign_report numbers automatically.';
