import { listRecentActivity } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

const EVENT_STYLES = {
  view: 'bg-white/10 text-white/60',
  unlock: 'bg-hot/20 text-hot',
  redeemed: 'bg-green-950/60 text-green-400',
  denied: 'bg-amber-950/60 text-amber-400',
  outside: 'bg-amber-950/60 text-amber-400',
  video_start: 'bg-blue-950/60 text-blue-400',
  video_complete: 'bg-blue-950/60 text-blue-400',
  cta_click: 'bg-white/10 text-white/60',
  share: 'bg-white/10 text-white/60',
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export async function renderActivitySection(container) {
  container.innerHTML = '<p class="text-white/40 text-sm">Loading…</p>'
  const rows = await listRecentActivity()

  container.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-condensed font-bold uppercase tracking-wide text-lg">Activity</h2>
      <button id="refresh-activity" class="btn-secondary text-sm py-1.5 px-3">Refresh</button>
    </div>
    <p class="text-sm text-white/50 mb-4">The last 300 real events across every fan and vendor interaction — newest first.</p>
    <div class="space-y-1.5">
      ${rows
        .map((r) => {
          const badge = EVENT_STYLES[r.event] ?? 'bg-white/10 text-white/60'
          const detail = [r.vendor_name, r.offer_headline || r.campaign_name, r.venue_name]
            .filter(Boolean)
            .map(escapeHtml)
            .join(' · ')
          const extra = []
          if (r.sale_amount != null) extra.push(`$${Number(r.sale_amount).toFixed(2)}`)
          if (r.distance_m != null) extra.push(`${r.distance_m}m`)
          return `
          <div class="flex items-center gap-3 card px-3 py-2 text-sm">
            <span class="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${badge}">${escapeHtml(r.event)}</span>
            <span class="flex-1 text-white/70 truncate">${detail || '<span class="text-white/30">no campaign context</span>'}</span>
            ${extra.length ? `<span class="text-xs text-white/40 shrink-0">${escapeHtml(extra.join(' · '))}</span>` : ''}
            <span class="text-xs text-white/30 shrink-0 whitespace-nowrap" title="${escapeHtml(new Date(r.at).toLocaleString())}">${relativeTime(r.at)}</span>
          </div>
        `
        })
        .join('') || '<p class="text-sm text-white/40">Nothing logged yet.</p>'}
    </div>
  `

  container.querySelector('#refresh-activity').addEventListener('click', () => renderActivitySection(container))
}
