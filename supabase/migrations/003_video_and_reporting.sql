-- ============================================================
-- HOT HAND BUYS — migration 002
-- Video/multimedia offers + vendor reporting
-- ============================================================

-- ------------------------------------------------------------
-- Video support on offers.
--
-- Two delivery paths on purpose:
--   'embed'  -> YouTube/Vimeo. Costs you nothing in egress. Default.
--   'hosted' -> Supabase Storage. Premium tier only, hard-capped.
--
-- Never autoplay. Poster image + tap to play. This keeps the page
-- under the 2s budget on stadium 5G AND makes "plays" a real
-- number you can charge for instead of an inflated impression.
-- ------------------------------------------------------------
alter table public.offers
  add column video_source     text check (video_source in ('embed','hosted')),
  add column video_url        text,          -- YouTube/Vimeo URL, or Storage URL
  add column video_poster_url text,          -- REQUIRED for hosted. First frame.
  add column video_seconds    integer check (video_seconds is null or video_seconds <= 60),
  add column video_bytes      bigint;

-- A hosted video without a poster will autoplay-or-blank on mobile.
-- Enforce it at the DB so the admin UI can't skip it.
alter table public.offers
  add constraint hosted_video_needs_poster
  check (video_source is distinct from 'hosted' or video_poster_url is not null);

comment on column public.offers.video_seconds is
  'Cap at 60. Sell 30s as standard, 60s as premium. Longer does not get watched.';
comment on column public.offers.video_bytes is
  'Keep hosted files under ~8MB. 1000 views of an 8MB file is 8GB of egress.';

-- ------------------------------------------------------------
-- New event types for multimedia engagement.
-- video_start / video_complete is the metric that justifies
-- charging more for a video slot than a text slot.
-- ------------------------------------------------------------
alter table public.impressions drop constraint if exists impressions_event_type_check;
alter table public.impressions
  add constraint impressions_event_type_check
  check (event_type in (
    'view','unlock','cta_click','denied','outside',
    'video_start','video_complete','share'
  ));

-- Watched-percentage bucket, only meaningful on video events.
alter table public.impressions
  add column video_pct integer check (video_pct is null or video_pct between 0 and 100);

-- ------------------------------------------------------------
-- VENDOR REPORT — rebuilt.
-- Only the numbers a vendor should see. Deliberately excludes
-- 'denied' and 'outside' counts: those are YOUR distribution
-- diagnostics, not their performance.
-- ------------------------------------------------------------
drop view if exists public.campaign_report;

create or replace view public.campaign_report as
select
  c.id                                                  as campaign_id,
  c.name                                                as campaign_name,
  vn.dba_name                                           as vendor,
  vn.id                                                 as vendor_id,
  o.headline,
  o.offer_type,
  c.starts_at,
  c.ends_at,
  c.price_paid,

  count(*) filter (where i.event_type = 'view')         as views,
  count(distinct i.session_id)
    filter (where i.event_type = 'view')                as unique_people,
  count(*) filter (where i.event_type = 'unlock')       as unlocks,
  count(*) filter (where i.event_type = 'cta_click')    as clicks,
  count(*) filter (where i.event_type = 'video_start')  as video_plays,
  count(*) filter (where i.event_type = 'video_complete') as video_completions,

  -- engagement rate: of everyone who saw it, who acted on it
  round(
    100.0 * count(*) filter (where i.event_type in ('unlock','cta_click'))
    / nullif(count(*) filter (where i.event_type = 'view'), 0)
  , 1)                                                  as engagement_pct,

  (select count(*) from redemptions r
     where r.campaign_id = c.id)                        as redemptions,
  (select coalesce(sum(r.sale_amount), 0) from redemptions r
     where r.campaign_id = c.id)                        as attributed_sales,

  -- what it cost them per person actually reached
  round(
    c.price_paid / nullif(count(distinct i.session_id)
      filter (where i.event_type = 'view'), 0)
  , 2)                                                  as cost_per_person

from campaigns c
join vendors vn on vn.id = c.vendor_id
join offers  o  on o.id  = c.offer_id
left join impressions i on i.campaign_id = c.id
group by c.id, c.name, vn.dba_name, vn.id, o.headline, o.offer_type,
         c.starts_at, c.ends_at, c.price_paid;

-- ------------------------------------------------------------
-- Hourly breakdown. This is the chart that sells the next game --
-- it shows the vendor exactly when the crowd was live, which
-- tells them when to be staffed and ready.
-- ------------------------------------------------------------
create or replace view public.campaign_hourly as
select
  i.campaign_id,
  date_trunc('hour', i.created_at)                      as hour,
  count(*) filter (where i.event_type = 'view')         as views,
  count(distinct i.session_id)                          as unique_people,
  count(*) filter (where i.event_type = 'unlock')       as unlocks
from impressions i
where i.campaign_id is not null
group by i.campaign_id, date_trunc('hour', i.created_at)
order by hour;

-- ------------------------------------------------------------
-- YOUR diagnostics -- never show this to a vendor.
-- 'outside' means someone scanned but wasn't in the fence:
--   high outside count = flyers are landing too far from the gate.
-- 'denied' means they refused location permission:
--   high denied rate = your permission explainer copy is failing.
-- ------------------------------------------------------------
create or replace view public.venue_diagnostics as
select
  v.id                                                  as venue_id,
  v.name                                                as venue_name,
  v.radius_meters,
  date_trunc('day', i.created_at)                       as day,
  count(*) filter (where i.event_type = 'view')         as inside_views,
  count(*) filter (where i.event_type = 'outside')      as outside_scans,
  count(*) filter (where i.event_type = 'denied')       as permission_denied,
  round(
    100.0 * count(*) filter (where i.event_type = 'denied')
    / nullif(count(*), 0)
  , 1)                                                  as denied_pct,
  round(avg(i.distance_m) filter (where i.event_type = 'outside'))
                                                        as avg_outside_distance_m,
  round(avg(i.accuracy_m))                              as avg_gps_accuracy_m
from venues v
left join impressions i on i.venue_id = v.id
group by v.id, v.name, v.radius_meters, date_trunc('day', i.created_at);

grant select on public.campaign_report    to authenticated;
grant select on public.campaign_hourly    to authenticated;
grant select on public.venue_diagnostics  to authenticated;
