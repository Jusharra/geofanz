import './style.css'
import { supabase, supabaseConfigured } from './lib/supabase.js'
import { getSessionId } from './lib/session.js'
import { getPosition, coarsen } from './lib/geolocation.js'
import { getScenario, setScenario, mockLiveOffers, mockFenceCheck, mockIssueToken } from './lib/mock.js'
import { toEmbedUrl } from './lib/video.js'
import { tokenToDataUrl } from './lib/qr.js'

const app = document.getElementById('app')

// ---------- data ----------

async function fetchLiveOffers(lat, lng, accuracyM, locale) {
  if (!supabaseConfigured) return mockLiveOffers()
  const { data, error } = await supabase.rpc('get_live_offers', {
    p_lat: lat,
    p_lng: lng,
    p_accuracy_m: accuracyM ? Math.round(accuracyM) : null,
    p_locale: locale,
  })
  if (error) {
    console.error('get_live_offers failed', error)
    return []
  }
  return data ?? []
}

async function fetchFenceCheck(lat, lng, accuracyM) {
  if (!supabaseConfigured) return mockFenceCheck()
  const { data, error } = await supabase.rpc('check_fence', {
    p_lat: lat,
    p_lng: lng,
    p_accuracy_m: accuracyM ? Math.round(accuracyM) : null,
  })
  if (error) {
    console.error('check_fence failed', error)
    return null
  }
  return data?.[0] ?? null
}

async function fetchIssueToken(campaignId, lat, lng) {
  if (!supabaseConfigured) return mockIssueToken()
  const { data, error } = await supabase.rpc('issue_redemption_token', {
    p_campaign_id: campaignId,
    p_session_id: getSessionId(),
    p_lat: lat,
    p_lng: lng,
  })
  if (error) throw error
  return data?.[0]
}

async function logImpression({
  campaignId = null,
  offerId = null,
  venueId = null,
  eventType,
  insideFence,
  distanceM = null,
  accuracyM = null,
  lat = null,
  lng = null,
  videoPct = null,
}) {
  const row = {
    campaign_id: campaignId,
    offer_id: offerId,
    venue_id: venueId,
    session_id: getSessionId(),
    inside_fence: insideFence,
    distance_m: distanceM,
    accuracy_m: accuracyM ? Math.round(accuracyM) : null,
    coarse_lat: lat != null ? coarsen(lat) : null,
    coarse_lng: lng != null ? coarsen(lng) : null,
    event_type: eventType,
    video_pct: videoPct,
    user_agent: navigator.userAgent,
  }

  if (!supabaseConfigured) {
    console.info('[mock impression]', row)
    return
  }
  const { error } = await supabase.from('impressions').insert(row)
  if (error) console.error('impression insert failed', error)
}

// ---------- rendering ----------

// ctx = { where, endsAt } to show the venue/countdown bar (offers + empty
// states only, matching the brand reference -- loading/denied/outside just
// get the bare header). live = show the pulsing "Live Now" / custom label.
function shell(bodyHtml, { ctx = null, live = null } = {}) {
  app.innerHTML = `
    <div class="min-h-dvh flex flex-col">
      <header class="sticky top-0 z-50 bg-bg border-b-[3px] border-hot px-4 py-2.5 flex items-center justify-between gap-3">
        <div class="font-display text-[19px] uppercase tracking-tight leading-none">Hot Hand <span class="text-hot">Buys</span></div>
        ${live ? `
          <div class="flex items-center gap-1.5 font-condensed font-bold uppercase tracking-[.14em] text-[11px] text-live shrink-0">
            <span class="w-[7px] h-[7px] rounded-full bg-live animate-pulse"></span>${escapeHtml(live)}
          </div>` : ''}
      </header>
      ${ctx ? `
        <div class="bg-surface border-b border-line px-4 py-[9px] flex items-center justify-between gap-3">
          <div class="font-condensed font-semibold uppercase tracking-[.1em] text-xs text-chalk truncate">${escapeHtml(ctx.where)}</div>
          ${ctx.endsAt ? `
            <div class="text-right shrink-0">
              <span class="block font-condensed font-bold text-[10px] tracking-[.12em] text-chalk -mb-0.5">Ends in</span>
              <span class="font-display text-[13px] text-hot tabular-nums" data-ctx-countdown="${ctx.endsAt}">…</span>
            </div>` : ''}
        </div>` : ''}
      ${devBannerHtml()}
      <main class="flex-1 flex flex-col items-center justify-center px-4 text-center gap-6 py-8">
        ${bodyHtml}
      </main>
      <footer class="site-footer">
        <div class="font-display text-[13px] uppercase tracking-wide text-chalk mb-[11px]">Hot Hand Buys</div>
        <nav>
          <a href="/how-it-works">How It Works</a>
          <a href="/vendors">For Vendors</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/report">Report a Problem</a>
        </nav>
        <p class="text-[11.5px] text-white/35 leading-relaxed max-w-xs mx-auto mt-3">Deals are honored by the businesses offering them. We check your location once to unlock deals — we don't track you.</p>
      </footer>
    </div>
  `
  wireDevBanner()
  startCtxCountdown()
}

function startCtxCountdown() {
  const el = document.querySelector('[data-ctx-countdown]')
  if (!el) return
  const iso = el.dataset.ctxCountdown
  const tick = () => {
    const diffMs = new Date(iso).getTime() - Date.now()
    if (diffMs <= 0) {
      el.textContent = 'Ended'
      return
    }
    const h = Math.floor(diffMs / 3600000)
    const m = Math.floor((diffMs % 3600000) / 60000)
    const s = Math.floor((diffMs % 60000) / 1000)
    const pad = (n) => String(n).padStart(2, '0')
    el.textContent = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
    setTimeout(tick, 1000)
  }
  tick()
}

function devBannerHtml() {
  if (supabaseConfigured) return ''
  const scenario = getScenario()
  const btn = (id, label) => `
    <button data-scenario="${id}"
      class="px-3 py-1 rounded-full text-xs font-semibold border ${
        scenario === id
          ? 'bg-hot border-hot text-white'
          : 'border-white/20 text-white/60 hover:border-white/40'
      }">${label}</button>
  `
  return `
    <div class="bg-hot-dim/40 border-b border-hot/30 px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
      <span class="font-bold uppercase tracking-wide text-hot">Dev mock</span>
      <span class="text-white/50">no Supabase configured — simulating:</span>
      ${btn('offers', 'Offers live')}
      ${btn('empty', 'No offers')}
      ${btn('outside', 'Outside fence')}
    </div>
  `
}

function wireDevBanner() {
  document.querySelectorAll('[data-scenario]').forEach((el) => {
    el.addEventListener('click', () => {
      setScenario(el.dataset.scenario)
      run()
    })
  })
}

function renderLoading() {
  shell(`
    <div class="w-[34px] h-[34px] rounded-full border-[3px] border-line border-t-hot animate-spin"></div>
    <div>
      <h1 class="font-condensed font-bold uppercase text-[29px] leading-[1.08]">Checking your location</h1>
      <p class="text-[15px] text-white/60 mt-2">One second.</p>
    </div>
  `)
}

function renderOffers(offers, geo) {
  const venueName = offers[0]?.venue_name ?? 'this venue'
  const earliestEndsAt = offers
    .map((o) => o.ends_at)
    .sort((a, b) => new Date(a) - new Date(b))[0]

  const cards = offers
    .map(
      (o) => `
      <article class="w-full max-w-md bg-surface border border-line text-left overflow-hidden">
        ${o.media_url && !o.video_url ? `<img src="${escapeHtml(o.media_url)}" alt="" class="w-full aspect-video object-cover" />` : ''}
        ${o.video_url ? `<div class="aspect-video bg-black relative" data-video-slot="${o.offer_id}">
          <button type="button" data-play-video="${o.offer_id}" class="relative w-full h-full block">
            ${o.video_poster_url ? `<img src="${escapeHtml(o.video_poster_url)}" alt="" class="w-full h-full object-cover" />` : ''}
            <span class="absolute inset-0 flex items-center justify-center bg-black/20">
              <span class="w-14 h-14 rounded-full bg-hot flex items-center justify-center shadow-lg">
                <svg width="18" height="22" viewBox="0 0 18 22" fill="white"><path d="M0 0L18 11L0 22V0Z"/></svg>
              </span>
            </span>
          </button>
        </div>` : ''}
        <div class="p-[15px]">
          <p class="font-condensed font-bold uppercase tracking-[.14em] text-[11px] text-hot mb-[5px]">${escapeHtml(o.vendor_name)}</p>
          <h2 class="font-condensed font-bold uppercase text-2xl leading-[1.05] tracking-tight">${escapeHtml(o.headline)}</h2>
          ${o.deal_text ? `<p class="text-hot font-bold text-lg mt-[7px]">${escapeHtml(o.deal_text)}</p>` : ''}
          ${o.stakes ? `<p class="text-hot/90 text-sm font-semibold mt-1">${escapeHtml(o.stakes)}</p>` : ''}
          ${o.description ? `<p class="text-[14px] leading-[1.45] text-[#c7bfb9] mt-[7px]">${escapeHtml(o.description)}</p>` : ''}
          ${o.proof ? `<p class="text-chalk text-xs italic mt-2">${escapeHtml(o.proof)}</p>` : ''}
          ${o.action ? `<p class="text-[12.5px] text-chalk mt-[9px] flex items-center gap-1.5"><span class="text-hot">◆</span>${escapeHtml(o.action)}</p>` : ''}
          ${!o.cta_url ? `<div class="mt-[13px]" data-code-slot="${o.offer_id}">
            <button type="button" data-unlock="${o.offer_id}"
              class="w-full py-[14px] bg-hot hover:brightness-110 active:bg-hot-dim font-display uppercase tracking-wide text-[15px] transition">
              Unlock this deal
            </button>
          </div>` : ''}
          ${o.cta_url ? `<a href="${escapeHtml(o.cta_url)}" target="_blank" rel="noopener" data-cta="${o.offer_id}"
            class="mt-[13px] block w-full py-[14px] bg-hot hover:brightness-110 active:bg-hot-dim text-center font-display uppercase tracking-wide text-[15px] transition">
            ${ctaLabel(o.offer_type)}
          </a>` : ''}
        </div>
      </article>
    `
    )
    .join('')

  shell(
    `<div class="w-full flex flex-col items-center gap-3">${cards}</div>`,
    { live: 'Live Now', ctx: { where: venueName, endsAt: earliestEndsAt } }
  )

  wireUnlock(offers, geo)
  wireVideo(offers, geo)
  wireCta(offers, geo)
}

function ctaLabel(offerType) {
  if (offerType === 'download') return 'Download'
  if (offerType === 'link') return 'Visit site'
  return 'Learn more'
}

function wireCta(offers, geo) {
  const byId = new Map(offers.map((o) => [String(o.offer_id), o]))
  document.querySelectorAll('[data-cta]').forEach((link) => {
    link.addEventListener('click', () => {
      const o = byId.get(link.dataset.cta)
      if (!o) return
      logImpression({
        campaignId: o.campaign_id,
        offerId: o.offer_id,
        venueId: o.venue_id,
        eventType: 'cta_click',
        insideFence: true,
        distanceM: o.distance_m,
        accuracyM: geo?.accuracy,
        lat: geo?.latitude,
        lng: geo?.longitude,
      })
    }, { once: true })
  })
}

function wireVideo(offers, geo) {
  const byId = new Map(offers.map((o) => [String(o.offer_id), o]))
  document.querySelectorAll('[data-play-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const o = byId.get(btn.dataset.playVideo)
      if (!o) return
      const slot = document.querySelector(`[data-video-slot="${btn.dataset.playVideo}"]`)
      if (!slot) return

      const logStart = () =>
        logImpression({
          campaignId: o.campaign_id,
          offerId: o.offer_id,
          venueId: o.venue_id,
          eventType: 'video_start',
          insideFence: true,
          distanceM: o.distance_m,
          accuracyM: geo?.accuracy,
          lat: geo?.latitude,
          lng: geo?.longitude,
          videoPct: 0,
        })

      if (o.video_source === 'hosted') {
        slot.innerHTML = `<video src="${escapeHtml(o.video_url)}" controls autoplay playsinline class="w-full h-full"></video>`
        const videoEl = slot.querySelector('video')
        videoEl.addEventListener('play', logStart, { once: true })
        videoEl.addEventListener('ended', () =>
          logImpression({
            campaignId: o.campaign_id,
            offerId: o.offer_id,
            venueId: o.venue_id,
            eventType: 'video_complete',
            insideFence: true,
            distanceM: o.distance_m,
            accuracyM: geo?.accuracy,
            lat: geo?.latitude,
            lng: geo?.longitude,
            videoPct: 100,
          })
        , { once: true })
      } else {
        // Embedded YouTube/Vimeo: no reliable completion signal without
        // pulling in each platform's player SDK, which isn't worth the
        // extra weight on the fan page. Start is still the number that
        // matters most -- it's real engagement a flyer can't prove.
        slot.innerHTML = `<iframe src="${escapeHtml(toEmbedUrl(o.video_url))}" class="w-full h-full" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
        logStart()
      }
    }, { once: true })
  })
}

// One-time redemption token, rendered as a QR the vendor scans at their
// register. issue_redemption_token logs the 'unlock' impression itself
// (atomically, server-side) -- no client-side logImpression call here,
// unlike the old display_code reveal.
function wireUnlock(offers, geo) {
  const byId = new Map(offers.map((o) => [String(o.offer_id), o]))
  document.querySelectorAll('[data-unlock]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const o = byId.get(btn.dataset.unlock)
      if (!o) return
      const slot = document.querySelector(`[data-code-slot="${btn.dataset.unlock}"]`)
      if (!slot) return

      btn.disabled = true
      btn.textContent = 'Unlocking…'

      let result
      try {
        result = await fetchIssueToken(o.campaign_id, geo?.latitude, geo?.longitude)
      } catch (err) {
        slot.innerHTML = `<p class="text-red-400 text-sm">${escapeHtml(err.message ?? 'Could not unlock this offer.')}</p>`
        return
      }
      if (!result) {
        slot.innerHTML = `<p class="text-red-400 text-sm">Could not unlock this offer.</p>`
        return
      }

      const qrDataUrl = await tokenToDataUrl(result.token)
      slot.innerHTML = `
        <div class="bg-paper p-[26px] text-center animate-reveal">
          <p class="font-condensed font-bold uppercase tracking-[.16em] text-[11px] text-[#6e6560]">Show this to the vendor</p>
          <img src="${qrDataUrl}" alt="Redemption QR code" class="mx-auto w-full max-w-[190px] border-[5px] border-bg mt-4 mb-[14px]" />
          <p class="font-display text-black text-[38px] tracking-[.09em] tabular-nums">${escapeHtml(result.short_code)}</p>
          <p class="text-[#6e6560] text-[13px] mt-[11px]" data-token-expires></p>
        </div>
      `
      startSingleCountdown(slot.querySelector('[data-token-expires]'), result.expires_at)
    }, { once: true })
  })
}

function startSingleCountdown(el, iso) {
  if (!el) return
  const tick = () => {
    const diffMs = new Date(iso).getTime() - Date.now()
    if (diffMs <= 0) {
      el.textContent = 'Expired'
      return
    }
    const mins = Math.floor(diffMs / 60000)
    const secs = Math.floor((diffMs % 60000) / 1000)
    el.textContent = mins > 0 ? `Expires in ${mins}m ${secs}s` : `Expires in ${secs}s`
    setTimeout(tick, 1000)
  }
  tick()
}

function stateScreen({ mark, heading, body, buttonLabel, fine, onButton }) {
  shell(`
    <div class="font-display text-hot text-[44px] leading-none">${mark}</div>
    <div>
      <h1 class="font-condensed font-bold uppercase text-[29px] leading-[1.08]">${heading}</h1>
      <p class="text-[15px] leading-[1.55] text-[#b5aca6] mt-[11px] max-w-[280px] mx-auto">${body}</p>
    </div>
    ${buttonLabel ? `<button id="state-btn" class="w-full max-w-[280px] py-[14px] bg-hot hover:brightness-110 active:bg-hot-dim font-display uppercase tracking-wide text-[15px] transition">${buttonLabel}</button>` : ''}
    ${fine ? `<p class="text-[12.5px] text-chalk leading-relaxed">${fine}</p>` : ''}
  `)
  if (onButton) document.getElementById('state-btn')?.addEventListener('click', onButton)
}

function renderEmpty(venueName) {
  shell(
    `
    <div>
      <h1 class="font-condensed font-bold uppercase text-[29px] leading-[1.08]">Nothing running right now</h1>
      <p class="text-[15px] leading-[1.55] text-[#b5aca6] mt-[11px] max-w-[280px] mx-auto">Check back once the game gets going — deals here come and go all day.</p>
    </div>
  `,
    { ctx: { where: venueName ?? 'This venue' } }
  )
}

function renderOutside() {
  stateScreen({
    mark: '◎',
    heading: "You're not at a venue yet",
    body: 'These deals only work inside the stadium and the lots around it. Head over and check again — they\'re live until the event ends.',
    buttonLabel: 'Check again',
    onButton: run,
  })
}

function renderDenied(retry) {
  stateScreen({
    mark: '◉',
    heading: 'Deals unlock at the stadium',
    body: "We check your location once to see if you're at the venue. That's it — we don't track you, and we don't save your address.",
    buttonLabel: 'Show me the deals',
    fine: 'Your browser will ask permission next.',
    onButton: retry,
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str ?? ''
  return div.innerHTML
}

// ---------- flow ----------

async function run() {
  renderLoading()

  let position
  try {
    position = await getPosition()
  } catch (err) {
    renderDenied(run)
    logImpression({ eventType: 'denied', insideFence: false })
    return
  }

  const { latitude, longitude, accuracy } = position.coords
  const locale = navigator.language

  const [offers, fence] = await Promise.all([
    fetchLiveOffers(latitude, longitude, accuracy, locale),
    fetchFenceCheck(latitude, longitude, accuracy),
  ])

  if (offers.length > 0) {
    renderOffers(offers, { latitude, longitude, accuracy })
    for (const o of offers) {
      logImpression({
        campaignId: o.campaign_id,
        offerId: o.offer_id,
        venueId: o.venue_id,
        eventType: 'view',
        insideFence: true,
        distanceM: o.distance_m,
        accuracyM: accuracy,
        lat: latitude,
        lng: longitude,
      })
    }
    return
  }

  if (fence) {
    renderEmpty(fence.venue_name)
    logImpression({
      venueId: fence.venue_id,
      eventType: 'view',
      insideFence: true,
      distanceM: fence.distance_m,
      accuracyM: accuracy,
      lat: latitude,
      lng: longitude,
    })
    return
  }

  renderOutside()
  logImpression({
    eventType: 'outside',
    insideFence: false,
    accuracyM: accuracy,
    lat: latitude,
    lng: longitude,
  })
}

run()
