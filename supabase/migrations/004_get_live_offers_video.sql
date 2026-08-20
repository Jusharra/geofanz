-- ============================================================
-- GET_LIVE_OFFERS -- add video columns.
--
-- 003 added video_source/video_url/video_poster_url/video_seconds
-- to offers, but get_live_offers() (001) never picked them up --
-- the fan page has no way to receive them without this. Signature
-- and fence/window/translation logic are otherwise unchanged.
--
-- CREATE OR REPLACE can't add columns to a RETURNS TABLE result,
-- so this drops and recreates (grants don't survive a drop --
-- re-granted at the bottom).
-- ============================================================
drop function if exists public.get_live_offers(double precision, double precision, integer, text);

create function public.get_live_offers(
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer default null,
  p_locale text default null            -- from navigator.language
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
