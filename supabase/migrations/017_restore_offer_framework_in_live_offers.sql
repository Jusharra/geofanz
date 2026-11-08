-- ============================================================
-- Restore stakes / proof / action / video_seconds to get_live_offers.
--
-- The house-ads migration rewrote get_live_offers from an older copy and
-- dropped these four columns from its return type, so the fan page's
-- Hook/Stakes/Proof/Action card (and video length) silently rendered
-- without them. This is that same function plus the four columns --
-- nothing else changes: placement, is_house, venue_mode, slot caps and
-- house-fills-unsold-slots all behave exactly as before.
--
-- The return type changes, so CREATE OR REPLACE can't be used; drop and
-- recreate in one transaction so there's no window with no function.
-- ============================================================
begin;

drop function if exists public.get_live_offers(double precision, double precision, integer, text);

create function public.get_live_offers(
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer default null,
  p_locale text default null
)
returns table (
  campaign_id   uuid,
  offer_id      uuid,
  venue_id      uuid,
  venue_name    text,
  venue_mode    text,
  vendor_name   text,
  offer_type    text,
  placement     text,
  is_house      boolean,
  headline      text,
  description   text,
  deal_text     text,
  display_code  text,
  media_url     text,
  video_source  text,
  video_url     text,
  video_poster_url text,
  video_seconds integer,
  cta_url       text,
  stakes        text,
  proof         text,
  action        text,
  distance_m    integer,
  ends_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  with me as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  ),
  live as (
    select
      c.id as campaign_id, o.id as offer_id, v.id as venue_id,
      v.name as venue_name, v.mode as venue_mode, v.slot_limit,
      vn.dba_name as vendor_name, vn.is_house,
      o.offer_type, o.placement,
      coalesce(t.headline,    o.headline)    as headline,
      coalesce(t.description, o.description) as description,
      coalesce(t.deal_text,   o.deal_text)   as deal_text,
      o.display_code, o.media_url,
      o.video_source, o.video_url, o.video_poster_url, o.video_seconds,
      o.cta_url, o.stakes, o.proof, o.action,
      ST_Distance(v.geo, me.g)::integer as distance_m,
      o.sort_weight,
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
      and (
        v.mode = 'event'
        or (
          v.mode = 'always_on'
          and (
            v.open_hour is null
            or extract(hour from (now() at time zone v.timezone))
               between v.open_hour and v.close_hour
          )
        )
      )
      and ST_DWithin(v.geo, me.g,
            v.radius_meters + least(coalesce(p_accuracy_m, 0), 150))
  ),
  paid as (
    select *, row_number() over (
      partition by venue_id order by sort_weight desc, distance_m
    ) as rn
    from live where placement = 'feed' and not is_house
  ),
  paid_kept as (select * from paid where rn <= slot_limit),
  house as (
    select l.*, row_number() over (
      partition by l.venue_id order by l.sort_weight desc, l.distance_m
    ) as rn
    from live l where l.placement = 'feed' and l.is_house
  ),
  house_kept as (
    select h.* from house h
    where h.rn <= h.slot_limit
                  - (select count(*) from paid_kept p where p.venue_id = h.venue_id)
  ),
  final as (
    select *, 0 as grp from paid_kept
    union all
    select *, 1 as grp from house_kept
    union all
    select *, null::bigint as rn, 2 as grp from live where placement = 'utility'
  )
  select
    campaign_id, offer_id, venue_id, venue_name, venue_mode,
    vendor_name, offer_type, placement, is_house,
    headline, description, deal_text, display_code, media_url,
    video_source, video_url, video_poster_url, video_seconds,
    cta_url, stakes, proof, action,
    distance_m, ends_at
  from final
  order by grp, sort_weight desc, distance_m
$$;

grant execute on function public.get_live_offers(double precision, double precision, integer, text) to anon, authenticated;

commit;
