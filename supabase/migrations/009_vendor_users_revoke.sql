-- ============================================================
-- vendor_users.active -- revoking staff access can't be a DELETE.
--
-- redeem_token() and the /admin block-check both treat "no
-- vendor_users row for this user" as "this is the site admin, full
-- access." Deleting a row to revoke someone would therefore silently
-- promote them to admin instead of cutting them off -- the opposite
-- of the intent. A soft-revoke flag keeps the row (and the "this
-- user is a vendor, not the admin" fact) while cutting off
-- redemption authorization specifically.
-- ============================================================
alter table public.vendor_users add column active boolean not null default true;

create or replace function public.redeem_token(
  p_token       text,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_sale_amount numeric default null
)
returns table (
  status       text,
  message      text,
  offer_head   text,
  deal_text    text,
  redeemed_at  timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  t record;
  o record;
  v_membership record;
begin
  select * into t from redemption_tokens
  where token = p_token or short_code = upper(p_token);

  if not found then
    return query select 'not_found'::text, 'Code not recognized'::text,
                        null::text, null::text, null::timestamptz;
    return;
  end if;

  -- Any row at all (active or not) means this caller is a vendor-scoped
  -- account, never treated as admin -- only a caller with NO row is.
  select * into v_membership from vendor_users vu where vu.user_id = auth.uid();

  if found and (not v_membership.active or v_membership.vendor_id != t.vendor_id) then
    return query select 'wrong_vendor'::text,
                        case when not v_membership.active
                          then 'This account no longer has scanning access'
                          else 'This code is for a different business'
                        end::text,
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
