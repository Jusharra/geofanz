-- ============================================================
-- CHECK_FENCE -- fills a gap 001 left for anonymous fans.
--
-- get_live_offers() only returns a row when there's an active,
-- approved campaign at a venue you're inside. An empty result is
-- therefore ambiguous: it means either "you're inside the fence but
-- nothing is running" or "you're nowhere near a venue" -- and
-- CLAUDE.md requires the fan page to tell those two apart.
--
-- nearest_venues() could answer this, but it's granted to
-- `authenticated` only (admin/debug tool, by design -- it's a
-- distance-ranked list of every active venue). Rather than widen
-- that grant, this adds a narrower anon-safe check: same fence math
-- as get_live_offers (radius + clamped accuracy allowance), but
-- returns only the nearest in-range venue's id/name/distance. No
-- vendor, offer, or pricing data -- nothing here is sensitive.
-- ============================================================
create or replace function public.check_fence(
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer default null
)
returns table (
  venue_id    uuid,
  venue_name  text,
  distance_m  integer
)
language sql stable security definer set search_path = public as $$
  select v.id, v.name,
         ST_Distance(v.geo, me.g)::integer
  from venues v
  cross join lateral (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  ) me
  where v.active
    and ST_DWithin(v.geo, me.g, v.radius_meters + least(coalesce(p_accuracy_m, 0), 150))
  order by 3
  limit 1
$$;

grant execute on function public.check_fence to anon, authenticated;
