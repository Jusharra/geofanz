-- ============================================================
-- RECENT_ACTIVITY -- "what's happening" for the admin Activity tab.
-- Built entirely from existing impressions/redemptions data, on
-- purpose -- no new logging table, no error-capture pipeline. Just
-- the last 300 real events, readable.
-- ============================================================
create or replace view public.recent_activity as
select
  i.id::text                                            as id,
  i.created_at                                           as at,
  i.event_type                                           as event,
  c.name                                                 as campaign_name,
  o.headline                                             as offer_headline,
  vn.dba_name                                            as vendor_name,
  v.name                                                 as venue_name,
  i.distance_m,
  i.inside_fence,
  null::numeric                                          as sale_amount
from impressions i
left join campaigns c on c.id = i.campaign_id
left join offers o    on o.id = i.offer_id
left join vendors vn  on vn.id = c.vendor_id
left join venues v    on v.id = i.venue_id
union all
select
  r.id::text,
  r.redeemed_at,
  'redeemed',
  c.name,
  o.headline,
  vn.dba_name,
  null::text,
  null::integer,
  null::boolean,
  r.sale_amount
from redemptions r
left join campaigns c on c.id = r.campaign_id
left join offers o    on o.id = r.offer_id
left join vendors vn  on vn.id = c.vendor_id
order by at desc
limit 300;

grant select on public.recent_activity to authenticated;
