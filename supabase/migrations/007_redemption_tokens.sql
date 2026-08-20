-- ============================================================
-- HOT HAND BUYS — redemption tokens + vendor scan workflow
-- Ported from a customer conversation (captured in full in
-- CLAUDE.md). Two fixes applied vs. the version discussed:
--
--   1. redeem_token() had no vendor-scoping check. Combined with
--      the original `admin_tokens` policy (any authenticated user,
--      full access), a vendor's own staff login could redeem or
--      read ANY other vendor's tokens once a second vendor_users
--      row existed. Fixed by checking vendor_users membership
--      inside the function and splitting the RLS policy in two.
--   2. token_integrity's distant_redemptions only compared
--      latitude (`abs(issued_lat - redeemed_lat) > 0.02`) --
--      two points at the same latitude but miles apart in
--      longitude would read as zero distance. Replaced with a
--      real ST_Distance check using both axes.
--
-- Replaces the static display_code model. A shared code is a
-- screenshot waiting to happen: one post to a Fresno State
-- Facebook group and an offer sold for 50 people gets redeemed 300
-- times.
-- ============================================================

-- ------------------------------------------------------------
-- REDEMPTION TOKENS
-- Issued at unlock, one per fan per offer. Single use.
-- The fan's phone renders `token` as a QR; the vendor scans it.
-- `short_code` is the offline fallback when stadium 5G dies --
-- 6 characters the vendor can key in by hand.
-- ------------------------------------------------------------
create table public.redemption_tokens (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique default encode(gen_random_bytes(16), 'hex'),
  short_code      text not null unique,          -- 6 chars, no ambiguous glyphs
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  offer_id        uuid not null references public.offers(id) on delete cascade,
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  session_id      uuid not null,                 -- the fan's ephemeral visit id

  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,          -- always <= campaign.ends_at
  issued_lat      numeric(6,3),                  -- coarse, for audit only
  issued_lng      numeric(6,3),

  redeemed        boolean not null default false,
  redeemed_at     timestamptz,
  redeemed_by     uuid references auth.users(id),
  redeemed_lat    numeric(6,3),
  redeemed_lng    numeric(6,3),
  sale_amount     numeric(10,2),

  void            boolean not null default false,
  void_reason     text
);

create index idx_tokens_campaign on public.redemption_tokens (campaign_id);
create index idx_tokens_open on public.redemption_tokens (campaign_id)
  where redeemed = false and void = false;
create index idx_tokens_session on public.redemption_tokens (session_id);

-- Ambiguity-free alphabet: no 0/O, no 1/I/L. A vendor is reading
-- this off a cracked phone screen in daylight.
create or replace function public.gen_short_code()
returns text language plpgsql as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result   text := '';
  i        int;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from redemption_tokens where short_code = result);
  end loop;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- ISSUE A TOKEN  (called when the fan taps "unlock")
--
-- Anti-abuse: one open token per session per offer. Tapping
-- unlock five times returns the same token, it doesn't mint five.
-- ------------------------------------------------------------
create or replace function public.issue_redemption_token(
  p_campaign_id uuid,
  p_session_id  uuid,
  p_lat         double precision default null,
  p_lng         double precision default null
)
returns table (token text, short_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_campaign  record;
  v_existing  record;
  v_new       record;
begin
  select c.id, c.offer_id, c.vendor_id, c.ends_at, c.active, c.approved
    into v_campaign
  from campaigns c where c.id = p_campaign_id;

  if not found or not v_campaign.active or not v_campaign.approved then
    raise exception 'Campaign not available';
  end if;

  if now() > v_campaign.ends_at then
    raise exception 'This offer has ended';
  end if;

  -- reuse an existing unredeemed token rather than minting duplicates
  select t.token, t.short_code, t.expires_at into v_existing
  from redemption_tokens t
  where t.session_id = p_session_id
    and t.campaign_id = p_campaign_id
    and not t.redeemed and not t.void
    and t.expires_at > now()
  limit 1;

  if found then
    return query select v_existing.token, v_existing.short_code, v_existing.expires_at;
    return;
  end if;

  insert into redemption_tokens (
    short_code, campaign_id, offer_id, vendor_id, session_id,
    expires_at, issued_lat, issued_lng
  )
  values (
    gen_short_code(), p_campaign_id, v_campaign.offer_id, v_campaign.vendor_id,
    p_session_id, v_campaign.ends_at,
    round(p_lat::numeric, 3), round(p_lng::numeric, 3)
  )
  returning redemption_tokens.token, redemption_tokens.short_code,
            redemption_tokens.expires_at
  into v_new;

  insert into impressions (campaign_id, offer_id, session_id, inside_fence, event_type,
                           coarse_lat, coarse_lng)
  values (p_campaign_id, v_campaign.offer_id, p_session_id, true, 'unlock',
          round(p_lat::numeric, 3), round(p_lng::numeric, 3));

  return query select v_new.token, v_new.short_code, v_new.expires_at;
end;
$$;

-- ------------------------------------------------------------
-- REDEEM  (called by the VENDOR after scanning the fan's QR)
--
-- Requires an authenticated vendor account. Returns a clear
-- verdict string the vendor UI shows in big type -- the person
-- running the register needs a green light or a red light, not
-- an error object.
--
-- Vendor-scoping (fix #1): a caller present in vendor_users can
-- only redeem tokens for their own vendor_id. A caller absent from
-- vendor_users is treated as the site admin (existing shared-admin
-- model) and can redeem anything -- useful for testing and backup.
-- ------------------------------------------------------------
create or replace function public.redeem_token(
  p_token       text,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_sale_amount numeric default null
)
returns table (
  status       text,      -- ok | already_used | expired | not_found | void | wrong_vendor
  message      text,
  offer_head   text,
  deal_text    text,
  redeemed_at  timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  t record;
  o record;
  v_is_scoped_vendor boolean;
begin
  select * into t from redemption_tokens
  where token = p_token or short_code = upper(p_token);

  if not found then
    return query select 'not_found'::text, 'Code not recognized'::text,
                        null::text, null::text, null::timestamptz;
    return;
  end if;

  select exists (
    select 1 from vendor_users vu where vu.user_id = auth.uid()
  ) into v_is_scoped_vendor;

  if v_is_scoped_vendor and not exists (
    select 1 from vendor_users vu where vu.user_id = auth.uid() and vu.vendor_id = t.vendor_id
  ) then
    return query select 'wrong_vendor'::text, 'This code is for a different business'::text,
                        null::text, null::text, null::timestamptz;
    return;
  end if;

  select headline, offers.deal_text into o from offers where id = t.offer_id;

  if t.void then
    return query select 'void'::text, coalesce(t.void_reason, 'Code voided')::text,
                        o.headline, o.deal_text, null::timestamptz;
    return;
  end if;

  if t.redeemed then
    return query select 'already_used'::text,
                        'Already redeemed ' || to_char(t.redeemed_at, 'HH12:MI AM')::text,
                        o.headline, o.deal_text, t.redeemed_at;
    return;
  end if;

  if now() > t.expires_at then
    return query select 'expired'::text, 'This offer has ended'::text,
                        o.headline, o.deal_text, null::timestamptz;
    return;
  end if;

  update redemption_tokens
  set redeemed = true,
      redeemed_at = now(),
      redeemed_by = auth.uid(),
      redeemed_lat = round(p_lat::numeric, 3),
      redeemed_lng = round(p_lng::numeric, 3),
      sale_amount = p_sale_amount
  where id = t.id;

  insert into redemptions (campaign_id, offer_id, session_id, code,
                           redeemed_by, sale_amount)
  values (t.campaign_id, t.offer_id, t.session_id, t.short_code,
          auth.uid()::text, p_sale_amount);

  return query select 'ok'::text, 'Redeemed'::text, o.headline, o.deal_text, now();
end;
$$;

-- ------------------------------------------------------------
-- Vendor accounts -- links a Supabase auth user to a vendor so
-- their staff can scan, without seeing anyone else's data.
-- ------------------------------------------------------------
create table public.vendor_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  role       text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

alter table public.redemption_tokens enable row level security;
alter table public.vendor_users      enable row level security;

-- Fix #1 continued: split the single blanket policy into an
-- admin-full-access policy and a vendor-scoped-read policy, instead
-- of granting every authenticated user unrestricted access to every
-- vendor's tokens.
create policy admin_tokens_full on public.redemption_tokens
  for all to authenticated
  using (not exists (select 1 from vendor_users vu where vu.user_id = auth.uid()))
  with check (not exists (select 1 from vendor_users vu where vu.user_id = auth.uid()));

create policy vendor_tokens_scoped on public.redemption_tokens
  for select to authenticated
  using (exists (
    select 1 from vendor_users vu
    where vu.user_id = auth.uid() and vu.vendor_id = redemption_tokens.vendor_id
  ));

-- A vendor reads their own membership row (to know their vendor_id);
-- the admin (not in vendor_users) manages all of them, for the
-- staff-invite UI.
create policy vendor_users_self on public.vendor_users
  for select to authenticated using (user_id = auth.uid());

create policy admin_vendor_users on public.vendor_users
  for all to authenticated
  using (not exists (select 1 from vendor_users vu2 where vu2.user_id = auth.uid()))
  with check (not exists (select 1 from vendor_users vu2 where vu2.user_id = auth.uid()));

grant execute on function public.issue_redemption_token to anon, authenticated;
grant execute on function public.redeem_token          to authenticated;

-- ------------------------------------------------------------
-- FRAUD / QUALITY SIGNALS -- yours, not the vendor's.
--
-- Fix #2: distant_redemptions now uses a real geography distance
-- (both lat AND lng) instead of a latitude-only degree delta, which
-- missed same-latitude/different-longitude passes entirely. 2000m
-- threshold gives headroom over the ~110m noise floor from 3-decimal
-- coarse coordinates.
-- ------------------------------------------------------------
create or replace view public.token_integrity as
select
  c.id                                                as campaign_id,
  c.name                                              as campaign_name,
  count(t.*)                                          as issued,
  count(t.*) filter (where t.redeemed)                as redeemed,
  round(100.0 * count(t.*) filter (where t.redeemed)
        / nullif(count(t.*), 0), 1)                   as redeem_rate_pct,
  count(distinct t.session_id)                        as unique_sessions,
  round(count(t.*)::numeric
        / nullif(count(distinct t.session_id), 0), 2) as tokens_per_session,
  count(t.*) filter (
    where t.redeemed
      and t.issued_lat is not null and t.issued_lng is not null
      and t.redeemed_lat is not null and t.redeemed_lng is not null
      and ST_Distance(
            ST_SetSRID(ST_MakePoint(t.issued_lng, t.issued_lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(t.redeemed_lng, t.redeemed_lat), 4326)::geography
          ) > 2000
  )                                                   as distant_redemptions
from campaigns c
left join redemption_tokens t on t.campaign_id = c.id
group by c.id, c.name;

grant select on public.token_integrity to authenticated;
