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

function shell(bodyHtml) {
  app.innerHTML = `
    <div class="min-h-dvh flex flex-col">
      ${devBannerHtml()}
      <main class="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        ${bodyHtml}
      </main>
      <footer class="site-footer">
        <nav>
          <a href="/how-it-works">How It Works</a>
          <a href="/vendors">For Vendors</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/report">Report a Problem</a>
        </nav>
      </footer>
    </div>
  `
  wireDevBanner()
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
    <div class="animate-pulse w-10 h-10 rounded-full bg-hot"></div>
    <p class="text-lg text-white/70">Checking your location…</p>
  `)
}

function renderOffers(offers, geo) {
  const venueName = offers[0]?.venue_name ?? 'this venue'
  const cards = offers
    .map(
      (o) => `
      <article class="w-full max-w-md bg-surface rounded-2xl p-5 text-left border border-white/10">
        <p class="text-xs uppercase tracking-wide text-white/40">${escapeHtml(o.vendor_name)}</p>
        <h2 class="text-2xl font-extrabold mt-1">${escapeHtml(o.headline)}</h2>
        ${o.deal_text ? `<p class="text-hot font-bold text-lg mt-1">${escapeHtml(o.deal_text)}</p>` : ''}
        ${o.stakes ? `<p class="text-hot/90 text-sm font-semibold mt-1">${escapeHtml(o.stakes)}</p>` : ''}
        ${o.description ? `<p class="text-white/60 text-sm mt-2">${escapeHtml(o.description)}</p>` : ''}
        ${o.proof ? `<p class="text-white/40 text-xs italic mt-2">${escapeHtml(o.proof)}</p>` : ''}
        ${o.media_url && !o.video_url ? `<img src="${escapeHtml(o.media_url)}" alt="" class="mt-4 w-full rounded-xl aspect-video object-cover" />` : ''}
        ${o.video_url ? `<div class="mt-4 rounded-xl overflow-hidden bg-black aspect-video" data-video-slot="${o.offer_id}">
          <button type="button" data-play-video="${o.offer_id}" class="relative w-full h-full block">
            ${o.video_poster_url ? `<img src="${escapeHtml(o.video_poster_url)}" alt="" class="w-full h-full object-cover" />` : ''}
            <span class="absolute inset-0 flex items-center justify-center bg-black/20">
              <span class="w-14 h-14 rounded-full bg-hot flex items-center justify-center shadow-lg">
                <svg width="18" height="22" viewBox="0 0 18 22" fill="white"><path d="M0 0L18 11L0 22V0Z"/></svg>
              </span>
            </span>
          </button>
        </div>` : ''}
        <p class="text-xs text-white/30 mt-4" data-ends-at="${o.ends_at}">Ends in …</p>
        ${!o.cta_url ? `<div class="mt-4" data-code-slot="${o.offer_id}">
          ${o.action ? `<p class="text-white/50 text-xs mb-2">${escapeHtml(o.action)}</p>` : ''}
          <button type="button" data-unlock="${o.offer_id}"
            class="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold tracking-wide transition">
            Tap to unlock
          </button>
        </div>` : ''}
        ${o.cta_url ? `<a href="${escapeHtml(o.cta_url)}" target="_blank" rel="noopener" data-cta="${o.offer_id}"
          class="mt-4 block w-full py-3 rounded-xl bg-hot text-center font-bold tracking-wide">
          ${ctaLabel(o.offer_type)}
        </a>` : ''}
      </article>
    `
    )
    .join('')

  shell(`
    <p class="text-sm text-white/50">${escapeHtml(venueName)}</p>
    <h1 class="text-3xl font-black">Deals live right now</h1>
    <div class="w-full flex flex-col items-center gap-4">${cards}</div>
  `)

  startCountdowns()
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
        <div class="rounded-xl bg-white p-4 text-center animate-reveal">
          <img src="${qrDataUrl}" alt="Redemption QR code" class="mx-auto w-full max-w-[220px]" />
          <p class="text-black/40 text-xs uppercase tracking-widest mt-3">Show this at the register</p>
          <p class="text-black font-black text-2xl tracking-widest mt-1">${escapeHtml(result.short_code)}</p>
          <p class="text-black/40 text-xs mt-1" data-token-expires></p>
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

function renderEmpty(venueName) {
  shell(`
    <h1 class="text-2xl font-bold">Nothing running right now</h1>
    <p class="text-white/50 max-w-sm">${escapeHtml(venueName ?? 'this venue')} doesn't have an active deal at the moment. Check back once the game gets going.</p>
  `)
}

function renderOutside() {
  shell(`
    <h1 class="text-2xl font-bold">You're not at a venue</h1>
    <p class="text-white/50 max-w-sm">Deals unlock at the stadium. Head to the venue during a live event and reload this page.</p>
  `)
}

function renderDenied(retry) {
  shell(`
    <h1 class="text-2xl font-bold">Location access needed</h1>
    <p class="text-white/50 max-w-sm">We use your location only to check whether you're inside the venue right now — nothing is stored beyond that. It's not saved to an account or shared.</p>
    <button id="retry-btn" class="px-6 py-3 rounded-full bg-hot font-bold">Try again</button>
  `)
  document.getElementById('retry-btn')?.addEventListener('click', retry)
}

function startCountdowns() {
  const els = [...document.querySelectorAll('[data-ends-at]')]
  if (els.length === 0) return
  const tick = () => {
    const now = Date.now()
    let anyLive = false
    for (const el of els) {
      const endsAt = new Date(el.dataset.endsAt).getTime()
      const diffMs = endsAt - now
      if (diffMs <= 0) {
        el.textContent = 'Ended'
        continue
      }
      anyLive = true
      const mins = Math.floor(diffMs / 60000)
      const secs = Math.floor((diffMs % 60000) / 1000)
      el.textContent = mins > 0 ? `Ends in ${mins}m ${secs}s` : `Ends in ${secs}s`
    }
    if (anyLive) requestAnimationFrame(() => setTimeout(tick, 1000))
  }
  tick()
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
