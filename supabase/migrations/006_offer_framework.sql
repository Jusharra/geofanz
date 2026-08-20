-- ============================================================
-- OFFER FRAMEWORK — Hook / Stakes / Proof / Action
--
-- From a customer conversation (captured in full in CLAUDE.md):
-- a vendor who writes "10% off" gets a 2% engagement rate and
-- doesn't renew. The fix isn't a suggestion, it's structure.
--
-- `headline` (001) already IS the Hook -- "Free birria taco with
-- any plate" beats "great Mexican food." No new column for it;
-- the admin form just relabels it. stakes/proof/action are new.
--
-- Nullable at the DB level on purpose -- existing offers shouldn't
-- break, and "required" here means the admin FORM enforces it for
-- anything created or edited going forward, not a hard constraint
-- on historical rows.
-- ------------------------------------------------------------
alter table public.offers
  add column stakes text,   -- why now. "Expires at final whistle."
  add column proof  text,   -- one line of credibility. "12 years on Blackstone."
  add column action text;   -- exactly what to do. "Show this at the red truck by Gate 3."

comment on column public.offers.stakes is
  'Urgency, not just deadline mechanics -- make the vendor say it out loud.';
comment on column public.offers.proof is
  'One line. A number or a specific claim beats an adjective.';
comment on column public.offers.action is
  'Exactly what the fan does at the register. Redundant with the QR/code flow on purpose -- humans skim.';

-- ------------------------------------------------------------
-- GET_LIVE_OFFERS -- add stakes/proof/action.
-- Same drop+recreate constraint as 004: CREATE OR REPLACE can't
-- add columns to a RETURNS TABLE result.
-- ------------------------------------------------------------
drop function if exists public.get_live_offers(double precision, double precision, integer, text);

create function public.get_live_offers(
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer default null,
  p_locale text default null
)
returns table (
  campaign_id      uuid,
  offer_id         uuid,
  venue_id         uuid,
  venue_name       text,
  vendor_name      text,
  offer_type       text,
  headline         text,
  description      text,
  deal_text        text,
  display_code     text,
  media_url        text,
  cta_url          text,
  video_source     text,
  video_url        text,
  video_poster_url text,
  video_seconds    integer,
  stakes           text,
  proof            text,
  action           text,
  distance_m       integer,
  ends_at          timestamptz
)
language sql stable security definer set search_path = public as $$
  with me as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  )
  select
    c.id, o.id, v.id, v.name, vn.dba_name,
    o.offer_type,
    coalesce(t.headline,    o.headline),
    coalesce(t.description, o.description),
    coalesce(t.deal_text,   o.deal_text),
    o.display_code, o.media_url, o.cta_url,
    o.video_source, o.video_url, o.video_poster_url, o.video_seconds,
    o.stakes, o.proof, o.action,
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
    and ST_DWithin(v.geo, me.g, v.radius_meters + least(coalesce(p_accuracy_m, 0), 150))
  order by o.sort_weight desc, ST_Distance(v.geo, me.g)
$$;

grant execute on function public.get_live_offers to anon, authenticated;
