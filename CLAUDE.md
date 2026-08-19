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
