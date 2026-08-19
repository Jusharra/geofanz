-- ============================================================
-- HOT HAND BUYS — v1 schema
-- Ported from GeoAirport (2012) + VendorManagementSystem (2020)
-- Target: Supabase / PostgreSQL 15+ with PostGIS
-- ============================================================
--
-- PORTING MAP (old -> new)
--   uniqueidentifier      -> uuid default gen_random_uuid()
--   nvarchar(n) / max     -> text
--   bit                   -> boolean
--   datetime              -> timestamptz          (was naive; real bug for game windows)
--   geography             -> geography(Point,4326) (same SRID as your 2012 code)
--   STDistance(x) <= n    -> ST_DWithin(a, b, n)   (index-accelerated; STDistance was not)
--   Members + password    -> auth.users (Supabase Auth) + profiles
--   33 stored procs       -> PostgREST auto-API + 2 RPC functions for geo
--
-- DEFERRED to v2 (present in 2020 schema, not needed to ship):
--   Members / Member_Accounts / TransferEnvelope / TransferPayload / Items
--   -> that is a closed-loop wallet. Real system, wrong problem for week one.
--   Agents / Roles / Establishments -> fold into profiles.role when you need them.
-- ============================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- VENUES  (was: Locations)
-- Added radius_meters: your 2012 geolocation_get_nearest hardcoded
-- 1000m. Making it per-venue is the whole difference between a demo
-- and a product -- a stadium fence and a barbershop fence aren't
-- the same size, and you need to tune it live from your phone.
-- ------------------------------------------------------------
create table public.venues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  city            text,
  state_province  text,
  postal_code     text,
  country         text default 'US',
  latitude        double precision not null,
  longitude       double precision not null,
  geo             geography(Point, 4326),
  radius_meters   integer not null default 800,   -- stadium+lots. 50m buffer for GPS drift is baked in.
  venue_type      text default 'stadium',         -- stadium | arena | airport | venue | test
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-maintain the geography column. Replaces your
-- location_insert proc AND geolocation_refresh_geography entirely.
create or replace function public.venues_sync_geo()
returns trigger language plpgsql as $$
begin
  new.geo := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_venues_sync_geo
  before insert or update of latitude, longitude on public.venues
  for each row execute function public.venues_sync_geo();

create index idx_venues_geo on public.venues using gist (geo);
create index idx_venues_active on public.venues (active) where active = true;

-- ------------------------------------------------------------
-- VENDORS  (was: Vendors)
-- ------------------------------------------------------------
create table public.vendors (
  id              uuid primary key default gen_random_uuid(),
  dba_name        text not null,
  owner_name      text,
  email           text,
  phone           text,
  whatsapp        text,
  address_line_1  text,
  address_line_2  text,
  city            text,
  state_province  text,
  postal_code     text,
  country         text default 'US',
  billing_status  text not null default 'trial',  -- trial | active | past_due | canceled
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_vendors_active on public.vendors (active) where active = true;

-- ------------------------------------------------------------
-- OFFERS  (was: Offers + OfferType + Media, flattened)
-- OfferType was a lookup table with a uuid FK for what is
-- effectively an enum of ~5 values. Collapsed to a check constraint.
-- Media was a 2-column table; media_url lives here now, and files
-- go in Supabase Storage rather than a filesystem path.
-- ------------------------------------------------------------
create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  offer_type      text not null default 'text'
                    check (offer_type in ('text','image','video','download','coupon','link')),
  headline        text not null,
  description     text,
  deal_text       text,                -- "2 for $20", "$5 off"
  display_code    text,                -- redemption code shown after unlock
  media_url       text,                -- Supabase Storage public URL
  cta_url         text,
  sort_weight     integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_offers_vendor on public.offers (vendor_id);

-- ------------------------------------------------------------
-- CAMPAIGNS  (was: Campigns [sic] + Campaign_Locations)
-- This is the piece that makes it "game day only." An offer is
-- evergreen; a campaign is that offer, at these venues, in this
-- time window. Keeping your 2020 many-to-many so one campaign can
-- run across multiple stadiums.
-- ------------------------------------------------------------
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  offer_id        uuid not null references public.offers(id) on delete cascade,
  name            text,                -- "Boise State — Oct 10"
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  price_paid      numeric(10,2),       -- what the vendor paid you for this run
  approved        boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint campaign_window_valid check (ends_at > starts_at)
);

create index idx_campaigns_window on public.campaigns (starts_at, ends_at) where active = true;

create table public.campaign_venues (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  venue_id     uuid not null references public.venues(id) on delete cascade,
  unique (campaign_id, venue_id)
);

create index idx_campaign_venues_venue on public.campaign_venues (venue_id);

-- ------------------------------------------------------------
-- IMPRESSIONS  -- NEW. Nothing like this existed in either schema.
-- This table is the product. The vendor report is what you sell,
-- and you cannot invoice off numbers you didn't record.
--
-- Privacy: coarse lat/long only (~110m at 3dp). No device IDs, no
-- names, no persistent identifier. Enough to prove delivery, not
-- enough to track a person.
-- ------------------------------------------------------------
create table public.impressions (
  id            bigserial primary key,
  campaign_id   uuid references public.campaigns(id) on delete set null,
  offer_id      uuid references public.offers(id) on delete set null,
  venue_id      uuid references public.venues(id) on delete set null,
  session_id    uuid not null,          -- ephemeral, client-generated per visit
  inside_fence  boolean not null,
  distance_m    integer,
  accuracy_m    integer,                -- from the browser; high value = suspect
  coarse_lat    numeric(6,3),
  coarse_lng    numeric(6,3),
  event_type    text not null default 'view'
                  check (event_type in ('view','unlock','cta_click','denied','outside')),
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index idx_impressions_campaign on public.impressions (campaign_id, created_at desc);
create index idx_impressions_venue on public.impressions (venue_id, created_at desc);
create index idx_impressions_session on public.impressions (session_id);

-- ------------------------------------------------------------
-- REDEMPTIONS  (restores the original display_code intent)
-- The 2012 design had it right: display_code is what the VENDOR
-- scans at their own register. Impressions prove delivery;
-- redemptions prove revenue. Vendors renew on the second number.
--
-- Flow: fan unlocks offer -> gets a code -> vendor scans/keys it
-- at the counter -> row lands here.
-- ------------------------------------------------------------
create table public.redemptions (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.campaigns(id) on delete set null,
  offer_id      uuid references public.offers(id) on delete set null,
  session_id    uuid,                   -- links back to the impression
  code          text not null,          -- what was actually presented
  redeemed_at   timestamptz not null default now(),
  redeemed_by   text,                   -- staff initials / register id
  sale_amount   numeric(10,2),          -- optional, if vendor shares it
  note          text
);

create index idx_redemptions_campaign on public.redemptions (campaign_id, redeemed_at desc);
create unique index idx_redemptions_code on public.redemptions (code);

-- ------------------------------------------------------------
-- OFFER TRANSLATIONS  (was: Cultures + the translation engine)
-- Kept because the Central Valley is roughly half Spanish-speaking.
-- Falls back to the base offer text when no translation exists,
-- so this never blocks you shipping in English only.
-- ------------------------------------------------------------
create table public.offer_translations (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references public.offers(id) on delete cascade,
  locale       text not null,           -- 'es', 'es-MX', 'hmn', 'pa'
  headline     text not null,
  description  text,
  deal_text    text,
  created_at   timestamptz not null default now(),
  unique (offer_id, locale)
);

create index idx_offer_translations_lookup on public.offer_translations (offer_id, locale);

-- ============================================================
-- THE CORE QUERY
-- Direct descendant of geolocation_get_nearest_distance (2012),
-- with the time window from Campaigns (2020) folded in.
--
-- ST_DWithin instead of STDistance(...) <= n so the GiST index
-- actually gets used. Your old version table-scanned every row.
-- ============================================================
create or replace function public.get_live_offers(
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer default null,
  p_locale text default null            -- from navigator.language
)
returns table (
  campaign_id   uuid,
  offer_id      uuid,
  venue_id      uuid,
  venue_name    text,
  vendor_name   text,
  offer_type    text,
  headline      text,
  description   text,
  deal_text     text,
  display_code  text,
  media_url     text,
  cta_url       text,
  distance_m    integer,
  ends_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  with me as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  )
  select
    c.id, o.id, v.id, v.name, vn.dba_name,
    o.offer_type,
    -- translation with graceful fallback to the base offer
    coalesce(t.headline,    o.headline),
    coalesce(t.description, o.description),
    coalesce(t.deal_text,   o.deal_text),
    o.display_code, o.media_url, o.cta_url,
    ST_Distance(v.geo, me.g)::integer,
    c.ends_at
  from campaigns c
  join campaign_venues cv on cv.campaign_id = c.id
  join venues v           on v.id = cv.venue_id
  join offers o           on o.id = c.offer_id
  join vendors vn         on vn.id = c.vendor_id
  left join offer_translations t
         on t.offer_id = o.id
        and t.locale = split_part(coalesce(p_locale, ''), '-', 1)
  cross join me
  where c.active and c.approved
    and o.active and v.active and vn.active
    and now() between c.starts_at and c.ends_at
    -- the fence. radius + a clamped allowance for reported GPS accuracy.
    and ST_DWithin(v.geo, me.g, v.radius_meters + least(coalesce(p_accuracy_m, 0), 150))
  order by o.sort_weight desc, ST_Distance(v.geo, me.g)
$$;

-- Kept as a utility -- this is your geolocation_get_nearest, modernized.
-- Useful for the admin map and for "what's the nearest venue to me right now."
create or replace function public.nearest_venues(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 5000
)
returns table (id uuid, name text, distance_m integer, radius_meters integer)
language sql stable as $$
  select v.id, v.name,
         ST_Distance(v.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)::integer,
         v.radius_meters
  from venues v
  where v.active
    and ST_DWithin(v.geo, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by 3
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- This site is public and unauthenticated. Without RLS, anon
-- can read your vendor list, pricing, and every impression.
-- Deny-by-default; reads happen only through the RPC above.
-- ============================================================
alter table public.venues       enable row level security;
alter table public.vendors      enable row level security;
alter table public.offers       enable row level security;
alter table public.campaigns    enable row level security;
alter table public.campaign_venues enable row level security;
alter table public.impressions  enable row level security;
alter table public.redemptions  enable row level security;
alter table public.offer_translations enable row level security;

-- Anonymous visitors: may log an impression, may read nothing.
create policy anon_log_impression on public.impressions
  for insert to anon with check (true);

-- Authenticated admin (you) sees and controls everything.
-- Tighten to a role claim once you add staff.
create policy admin_all_venues     on public.venues          for all to authenticated using (true) with check (true);
create policy admin_all_vendors    on public.vendors         for all to authenticated using (true) with check (true);
create policy admin_all_offers     on public.offers          for all to authenticated using (true) with check (true);
create policy admin_all_campaigns  on public.campaigns       for all to authenticated using (true) with check (true);
create policy admin_all_cv         on public.campaign_venues for all to authenticated using (true) with check (true);
create policy admin_read_imp       on public.impressions     for select to authenticated using (true);
create policy admin_all_redeem     on public.redemptions     for all to authenticated using (true) with check (true);
create policy admin_all_trans      on public.offer_translations for all to authenticated using (true) with check (true);

grant execute on function public.get_live_offers  to anon, authenticated;
grant execute on function public.nearest_venues   to authenticated;

-- ============================================================
-- VENDOR REPORT -- what you hand a vendor on Monday morning.
-- ============================================================
create or replace view public.campaign_report as
select
  c.id                                          as campaign_id,
  c.name                                        as campaign_name,
  vn.dba_name                                   as vendor,
  o.headline,
  c.starts_at, c.ends_at, c.price_paid,
  count(*) filter (where i.event_type = 'view')       as views,
  count(*) filter (where i.event_type = 'unlock')     as unlocks,
  count(*) filter (where i.event_type = 'cta_click')  as clicks,
  count(distinct i.session_id)                        as unique_visitors,
  round(avg(i.distance_m))                            as avg_distance_m,
  (select count(*) from redemptions r where r.campaign_id = c.id)         as redemptions,
  (select coalesce(sum(r.sale_amount),0) from redemptions r
    where r.campaign_id = c.id)                                          as attributed_sales
from campaigns c
join vendors vn on vn.id = c.vendor_id
join offers  o  on o.id  = c.offer_id
left join impressions i on i.campaign_id = c.id
group by c.id, c.name, vn.dba_name, o.headline, c.starts_at, c.ends_at, c.price_paid;

-- ============================================================
-- SEED: Fresno test venues.
-- Valley Children's Stadium coords are approximate -- verify on a
-- map before the first game. 800m covers the bowl plus the lots.
-- ============================================================
insert into public.venues (name, description, city, state_province, latitude, longitude, radius_meters, venue_type)
values
  ('Valley Children''s Stadium', 'Fresno State Bulldogs football', 'Fresno', 'CA',
   36.8125, -119.7450, 800, 'stadium'),
  ('Save Mart Center', 'Fresno State basketball and concerts', 'Fresno', 'CA',
   36.8130, -119.7370, 500, 'arena'),
  ('Fresno Fairgrounds', 'Big Fresno Fair', 'Fresno', 'CA',
   36.7290, -119.7690, 600, 'venue');

-- Your own test fence. Set this to your house, drop the radius to
-- ~100m, and you can walk in and out of it to prove the thing works.
insert into public.venues (name, description, city, state_province, latitude, longitude, radius_meters, venue_type, active)
values ('TEST FENCE — set to my location', 'dev only', 'Fresno', 'CA',
        36.7378, -119.7871, 100, 'test', false);
