# Hot Hand Buys

Geofenced, time-boxed mobile offers. A fan near a venue during an event sees
local vendor offers on their phone. Outside the fence, or outside the window,
they see nothing. Vendors pay for placement; the delivery report is the product.

First live target: **Fresno State home games, Valley Children's Stadium.**
The Oct 10 Boise State game is the launch date.

---

## Stack

- **Supabase** — Postgres 15 + PostGIS. Auth, REST (PostgREST), Storage.
- **Vite + vanilla JS + Tailwind** — no React. Page must be interactive in
  under 2s on congested stadium 5G. Bundle size is a feature.
- **Netlify** — static hosting + serverless functions.
- **Stripe** — v2, not v1. Invoice manually at first.

## Hard constraints

1. **Speed over polish.** Every dependency has to earn its place. A fan
   standing in a parking lot with one bar will not wait 6 seconds.
2. **`SUPABASE_SERVICE_ROLE_KEY` never reaches the browser.** Anything using
   it lives in a Netlify function. The client gets the anon key only, and
   RLS is what protects the data.
3. **Location permission will be denied by some users.** That is a normal
   path, not an error state. Design the denied view properly.
4. **Privacy floor:** coarse lat/lng (3 decimals), ephemeral per-visit
   session UUID. No device fingerprinting, no persistent ID, no third-party
   trackers. This is both the right call and what keeps the business clean.
5. **No SMS in v1.** TCPA exposure is $500–$1,500 per message. Opt-in
   collection can be built later, carefully, with a compliant platform.

---

## Data model

Migration lives at `supabase/migrations/001_hothandbuys_init.sql`. Read it
before writing any query — it's commented with the reasoning.

```
venues              lat/lng + PostGIS geography + per-venue radius_meters
vendors             the businesses paying
offers              headline, deal, display_code, media, offer_type
campaigns           offer × time window × price_paid × approved
campaign_venues     many-to-many: one campaign, multiple venues
impressions         every view/unlock/click/denial — THIS IS THE PRODUCT
redemptions         display_code scanned at the vendor's register
offer_translations  locale fallback (es matters in the Central Valley)
```

Two RPCs:
- `get_live_offers(lat, lng, accuracy_m, locale)` — the whole fan-side query.
  Fence check, time window, approval, translation fallback, all in one call.
- `nearest_venues(lat, lng, radius_m)` — admin/debug utility.

`campaign_report` view is what gets handed to a vendor on Monday.

---

## Build order

**Phase 1 — fan page (`/`)**
Get location → call `get_live_offers` → render offers or the out-of-fence
state → log an impression either way. This is the entire product. Ship it
before anything else exists.

**Phase 2 — offer unlock**
Tap an offer → reveal `display_code` → log `unlock`. Code should render
large and high-contrast; it gets read across a counter in daylight.

**Phase 3 — admin (`/admin`)**
Supabase Auth behind it. CRUD on venues (with a map picker and a radius
slider), vendors, offers, campaigns. Report view per campaign.
Until this exists, manage rows in the Supabase dashboard directly — do not
let the admin panel delay Phase 1.

**Phase 4 — vendor-facing report link**
Read-only tokenized URL per campaign. This is the renewal mechanism.

---

## Fan page states — all four are required

| State | What the user sees |
|---|---|
| Loading | "Checking your location…" — with a spinner, under 2s |
| Inside fence, offers live | The offers. Venue name. A countdown to `ends_at`. |
| Inside fence, no live offers | "Nothing running right now." Not an error. |
| Outside fence | "You're not at a venue. Deals unlock at the stadium." |
| Permission denied | Explain what location is used for, offer a retry button. |

Log an impression on every one of these. Denials and out-of-fence views are
real data — they tell you whether the flyers are reaching people who never
make it into the fence.

---

## Geolocation notes

- `navigator.geolocation.getCurrentPosition` with
  `{ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }`.
- Requires HTTPS. Netlify provides it. `localhost` works for dev.
- Real-world accuracy is 10–20m, worse in crowds and near steel structures.
  The RPC already adds a clamped allowance (max 150m) on top of the venue
  radius to absorb this.
- Coordinates can be spoofed with devtools. Fine for v1 — but never build a
  billing model on impression counts you can't defend. Flat per-game pricing
  sidesteps this entirely.

---

## Testing the fence without going to a stadium

The migration seeds a row named `TEST FENCE — set to my location`
(inactive, 100m radius). Set its lat/lng to your house, activate it, attach
a campaign, and walk to the end of the block. Offers should appear and
disappear. That's the acceptance test for the whole system.

---

## Design direction

Bold, fast, a little loud — this is a game-day product, not a SaaS
dashboard. Big type, high contrast, readable in direct sun with a phone at
arm's length. Motion should be minimal and purposeful: the offer reveal is
the one moment worth animating. Dark background helps in a stadium at night
and saves battery on OLED.

Do not build a hero section. The user is standing outside holding a beer.
They scanned a code. Show them the deals.

---

## Legal boundaries to respect in code and copy

- No unlicensed team/league trademarks in any offer, ever. If an admin
  creates an offer mentioning Bulldogs, NFL, or a school logo, that's a
  business risk — worth a warning in the admin UI.
- No SMS collection until a compliant platform and consent language exist.
- Impression data is delivery proof, not a user profile. Keep it that way.

---

## The irresistible offer framework

A vendor who writes "10% off" gets a 2% engagement rate and doesn't renew.
Same slot, better offer — 15%, framed right — is the renewal. So the offer
form doesn't ask for a headline, it asks for four required parts:

- **Hook** — the specific thing, not the category. "Free birria taco with
  any plate" beats "great Mexican food." (`offers.headline`, relabeled —
  no separate column.)
- **Stakes** — why now. It's game day and it ends at final whistle. That's
  built into the product; make the vendor say it out loud. (`offers.stakes`)
- **Proof** — one line of credibility. "12 years on Blackstone." A number
  beats an adjective. (`offers.proof`)
- **Action** — exactly what to do. "Show this code at the red truck by
  Gate 3." (`offers.action`)

And coach the offer itself: give away one thing free with a purchase,
don't discount the whole ticket. A free drink costs the vendor 60¢ and
reads as a gift. 15% off a $12 plate costs $1.80 and reads as a coupon.
Better economics for them, better engagement for the report.

Video pricing follows the same logic — sell it as a tier, not an add-on.
Text slot $50, video slot $125. The justification is `video_plays` /
`video_completions` in the report: proof of watch-through no flyer or
Facebook boost can offer.

---

## Redemption — one-time tokens, not a shared code

A displayed code is a screenshot waiting to happen: one post to a Fresno
State Facebook group and an offer sold for 50 people gets redeemed 300
times. `supabase/migrations/007_redemption_tokens.sql` replaces the old
`display_code` reveal with a one-time token per fan per offer:

1. Fan taps unlock → `issue_redemption_token()` mints a token, rendered as
   a QR, plus a 6-character backup `short_code` (alphabet excludes
   `0/O/1/I/L` — a vendor reads this off a cracked phone screen in the
   sun, ambiguous characters cost real redemptions).
2. Tapping unlock repeatedly returns the *same* token, not new ones —
   otherwise one bored fan inflates the issued count and wrecks the
   redeem-rate math.
3. Vendor opens `/scan` (bookmarked, no app install), camera scans the QR
   → `redeem_token()` flips it to green **"REDEEMED"** or red
   **"ALREADY USED AT 2:47 PM."** Second scan of the same code always fails.
4. Offline fallback: stadium 5G can die at kickoff. The same `/scan` page
   has a manual 6-character entry field that hits the identical RPC — the
   vendor writes the code on paper and keys it in late if the network is
   down. Data's a few hours late; the vendor isn't standing there looking
   foolish.
5. `sale_amount` is optional on every redemption — vendors can skip it.
   Asking turns "38 redemptions" into "$412 in attributed sales," but it's
   pitched as the vendor's benefit, not a reporting requirement forced on
   them at the register.

Who actually cheats, in order of likelihood, and what stops them:

1. **Fans sharing codes** — high motive, easy. Solved by one-time tokens.
2. **Vendors not bothering to scan** — the real risk, and it's friction,
   not malice. If it takes more than three seconds they won't do it and
   redemption data goes empty. Hence: no install, bookmarked URL, camera
   opens, done.
3. **Us inflating numbers** — worth designing against, because a vendor
   who suspects it never renews. Every redemption row is timestamped,
   GPS-stamped, and tied to a unique token — the audit trail exists
   whether or not anyone ever asks for it.

### Two fixes made vs. the version first discussed

- **Vendor account scoping.** The original `redeem_token()` had no check
  binding a caller to their own vendor — any authenticated vendor login
  could redeem or read any other vendor's tokens. Fixed: `vendor_users`
  rows scope a caller to one `vendor_id`; a caller with no `vendor_users`
  row at all is the site admin (matches the existing single-shared-admin
  model everywhere else) and keeps full access. Revoking access is a soft
  flag (`vendor_users.active`), never a row delete — deleting the row
  would flip a revoked vendor back to "no row = admin," the opposite of
  the intent.
- **`token_integrity.distant_redemptions`** originally compared latitude
  only (`abs(issued_lat - redeemed_lat) > 0.02`), so two points at the
  same latitude but miles apart in longitude read as zero distance.
  Replaced with a real `ST_Distance` check on both axes.

`token_integrity` (`supabase/migrations/007`) is the fraud dashboard,
admin-only, never shown to a vendor:

- **`tokens_per_session`** above ~1.5 means automation or a shared device.
- **`distant_redemptions`** catches a code that got passed to someone
  across town.
- Watch **`avg_gps_accuracy_m`** in `venue_diagnostics` too — if it's
  coming back at 50m+ near the stadium structure, the fence needs more
  buffer than the 150m clamp in `get_live_offers`. Better to find that out
  on a test walk than on Oct 10.

CSV export of `campaign_report` is a ten-line client-side function and
ships first because it's fast. A one-page PDF (vendor name, the four big
numbers, the hourly chart) is what actually sells a taco-truck renewal —
nobody there opens a CSV — but it's deliberately deferred until there's a
game's worth of real data to design the layout around.

---

## Vendor reports — per-vendor, filtered, and (optionally) emailed

Reports in admin were originally one shared table for everyone. Two
problems with that: a vendor asking "can you show me my numbers" got
handed a screen with every other vendor's numbers on it too, and there
was no way to just hand a vendor their own report without a manual
export-and-trim step every time.

`src/admin/sections/reports.js` now has a vendor filter (`supabase/migrations/015_vendor_report_schedule.sql`
underlies this — `vendors.report_frequency` and `vendors.last_report_sent_at`)
scoping both the on-screen table and the CSV export to one vendor at a
time. Same convention as `is_vendor_user()` everywhere else: diagnostics
and token-integrity tabs stay admin-only and are never vendor-scoped —
they're internal fraud/fence-tuning signals, not vendor performance.

Emailing a vendor their report has two triggers, same template
(`netlify/functions/lib/vendor-report-html.js`), both going through
SendGrid (`netlify/functions/lib/sendgrid.js`):

1. **"Send now"** (`netlify/functions/send-vendor-report.js`) — a button
   next to the vendor filter in Reports. For the "vendor calls and wants
   their numbers today" case. Auth model matches `invite-vendor.js`: the
   caller's JWT identifies them, anyone with no `vendor_users` row is the
   admin and is the only one allowed to trigger a send.
2. **Scheduled** (`netlify/functions/scheduled-vendor-reports.js`, cron
   `@daily` via `netlify.toml`) — checks every vendor with
   `report_frequency` set to `weekly` or `monthly` and
   `last_report_sent_at` far enough in the past, sends, stamps the
   timestamp. `report_frequency` defaults to `none` (manual only); it's
   set per vendor on the vendor form in `src/admin/sections/vendors.js`.

`SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` are server-side-only Netlify
env vars (never reach the browser, same rule as the service role key).
`SENDGRID_FROM_EMAIL` just needs to be a SendGrid-verified single sender
to start — a Gmail address works fine for testing. Switching to a real
`@hothandbuys.us` sender later means adding SPF/DKIM records for that
domain in SendGrid, which should wait until the `hothandbuys.us` DNS
situation is sorted (the domain is mid-transfer as of writing and was
briefly pointed at an unrelated Shopify store — worth confirming it
resolves to Netlify before adding more DNS records on top of it).
