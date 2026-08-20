import { listOffers, upsertOffer, deleteOffer, listVendors } from '../lib/data.js'
import { uploadOfferImage, uploadOfferPoster, uploadOfferVideo } from '../lib/storage.js'
import { escapeHtml } from '../lib/dom.js'
import { toastSuccess, toastError } from '../lib/toast.js'

const OFFER_TYPES = ['text', 'image', 'video', 'download', 'coupon', 'link']

// Non-blocking heads-up per CLAUDE.md: unlicensed team/league marks in offer
// copy are a business risk worth flagging, not worth hard-blocking a save.
const TRADEMARK_FLAGS = [
  'bulldogs', 'nfl', 'nba', 'nhl', 'mlb', 'ncaa', 'official sponsor',
  'official partner', 'championship', 'super bowl',
]

let editingId = null

export async function renderOffersSection(container) {
  const [offers, vendors] = await Promise.all([listOffers(), listVendors()])

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Offers</h2>
          <button id="offer-new" class="btn-primary text-sm py-1.5 px-3">+ New offer</button>
        </div>
        <div class="space-y-2" id="offer-list"></div>
      </div>
      <div class="card p-4">
        <form id="offer-form" class="space-y-4">
          <div>
            <label class="field-label" for="vendor_id">Vendor</label>
            <select id="vendor_id" name="vendor_id" required class="field-select">
              ${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.dba_name)}</option>`).join('')}
            </select>
          </div>
          <div class="rounded-xl border border-white/10 p-3 space-y-4">
            <p class="text-xs font-bold uppercase tracking-wide text-hot">The irresistible offer framework</p>
            <div>
              <label class="field-label" for="headline">Hook — the specific thing, not the category</label>
              <input id="headline" name="headline" required placeholder="Free birria taco with any plate" class="field-input" />
              <p class="field-hint">"Free birria taco with any plate" beats "great Mexican food."</p>
            </div>
            <div>
              <label class="field-label" for="stakes">Stakes — why now</label>
              <input id="stakes" name="stakes" required placeholder="Expires at final whistle" class="field-input" />
              <p class="field-hint">It's game day and it ends when the game does. Say it out loud.</p>
            </div>
            <div>
              <label class="field-label" for="proof">Proof — one line of credibility</label>
              <input id="proof" name="proof" required placeholder="12 years on Blackstone" class="field-input" />
              <p class="field-hint">A number or a specific claim beats an adjective.</p>
            </div>
            <div>
              <label class="field-label" for="action">Action — exactly what to do</label>
              <input id="action" name="action" required placeholder="Show this code at the red truck by Gate 3" class="field-input" />
              <p class="field-hint">Tell them precisely where to go and what to show.</p>
            </div>
          </div>

          <div>
            <label class="field-label" for="deal_text">Deal text</label>
            <input id="deal_text" name="deal_text" placeholder="2 for $20, $5 off…" class="field-input" />
            <p class="field-hint">Give away one thing free with a purchase rather than discounting the ticket — a free drink costs 60¢ and reads as a gift; 15% off reads as a coupon.</p>
          </div>
          <div>
            <label class="field-label" for="description">Description</label>
            <textarea id="description" name="description" rows="2" class="field-textarea"></textarea>
          </div>
          <p id="trademark-warning" class="hidden text-xs text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2"></p>

          <div>
            <label class="field-label">Photo</label>
            <div class="flex items-center gap-3">
              <div class="media-preview" id="media-preview"></div>
              <div>
                <label class="btn-secondary inline-block cursor-pointer text-sm">
                  Upload photo
                  <input type="file" id="media-input" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" />
                </label>
                <p class="field-hint" id="media-status">PNG, JPG, WebP, or GIF. Under 3MB. Shows on the fan-page card.</p>
              </div>
            </div>
            <input id="media_url" name="media_url" type="url" placeholder="or paste an image URL directly" class="field-input mt-2" />
          </div>

          <div>
            <label class="field-label" for="offer_type">Offer type</label>
            <select id="offer_type" name="offer_type" class="field-select">
              ${OFFER_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="field-label" for="cta_url">CTA URL</label>
            <input id="cta_url" name="cta_url" type="url" class="field-input" />
            <p class="field-hint">Renders as a button on the fan card — "Visit site" for link offers, "Download" for download offers. Leave blank for anything redeemed in person — those get a one-time QR code instead.</p>
          </div>

          <div id="video-fields" class="hidden space-y-4 border-t border-white/10 pt-4">
            <div>
              <label class="field-label" for="video_source">Video source</label>
              <select id="video_source" name="video_source" class="field-select">
                <option value="embed">Embed (YouTube/Vimeo) — free</option>
                <option value="hosted">Hosted (Supabase Storage) — premium, capped ~8MB</option>
              </select>
            </div>
            <div>
              <label class="field-label" for="video_url">Video URL</label>
              <input id="video_url" name="video_url" type="url" placeholder="https://youtube.com/watch?v=…" class="field-input" />
              <div id="video-upload-row" class="hidden mt-2 flex items-center gap-3">
                <div class="media-preview" id="video-preview"></div>
                <div>
                  <label class="btn-secondary inline-block cursor-pointer text-sm">
                    Upload video file
                    <input type="file" id="video-input" accept="video/mp4,video/webm,video/quicktime" class="hidden" />
                  </label>
                  <p class="field-hint" id="video-status">MP4, WebM, or MOV. Under 8MB.</p>
                </div>
              </div>
            </div>
            <div>
              <label class="field-label" for="video_poster_url">Poster image URL</label>
              <input id="video_poster_url" name="video_poster_url" type="url" placeholder="First-frame thumbnail" class="field-input" />
              <div class="mt-2 flex items-center gap-3">
                <div class="media-preview" id="poster-preview"></div>
                <div>
                  <label class="btn-secondary inline-block cursor-pointer text-sm">
                    Upload poster image
                    <input type="file" id="poster-input" accept="image/png,image/jpeg,image/webp" class="hidden" />
                  </label>
                  <p class="field-hint" id="poster-status">Required for hosted video — without it the tap target is blank.</p>
                </div>
              </div>
            </div>
            <div>
              <label class="field-label" for="video_seconds">Length (seconds, max 60)</label>
              <input id="video_seconds" name="video_seconds" type="number" min="1" max="60" placeholder="30" class="field-input" />
              <p class="field-hint">Sell 30s as standard, 60s as premium — longer doesn't get watched.</p>
            </div>
          </div>

          <label class="switch">
            <input type="checkbox" name="active" checked />
            <span class="track"><span class="thumb"></span></span>
            <span class="text-sm">Active</span>
          </label>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="btn-primary">Save offer</button>
            <button type="button" id="offer-cancel" class="btn-secondary">Cancel</button>
          </div>
          <p id="offer-error" class="text-sm text-red-400"></p>
        </form>
      </div>
    </div>
  `

  renderList(container, offers)
  wireForm(container)

  container.querySelector('#offer-new').addEventListener('click', () => resetForm(container))
  container.querySelector('#offer-cancel').addEventListener('click', () => resetForm(container))
}

function renderList(container, offers) {
  const list = container.querySelector('#offer-list')
  list.innerHTML = offers
    .map(
      (o) => `
      <div class="flex items-center justify-between card px-3 py-2.5">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(o.headline)} ${o.active ? '' : '<span class="text-white/30">(inactive)</span>'}</p>
          <p class="text-xs text-white/40">${escapeHtml(o.vendors?.dba_name ?? '—')} · ${o.offer_type}${o.video_url ? ` · 🎬 ${o.video_source}` : ''}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-edit="${o.id}" class="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">Edit</button>
          <button data-delete="${o.id}" class="text-xs px-2.5 py-1 rounded-lg bg-red-950/60 text-red-300 hover:bg-red-900/60 transition-colors">Delete</button>
        </div>
      </div>
    `
    )
    .join('') || '<p class="text-sm text-white/40">No offers yet.</p>'

  list.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const o = offers.find((x) => x.id === btn.dataset.edit)
      if (o) fillForm(container, o)
    })
  )
  list.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const o = offers.find((x) => x.id === btn.dataset.delete)
      if (!confirm(`Delete offer "${o?.headline}"? Campaigns using it will be deleted too.`)) return
      await deleteOffer(btn.dataset.delete)
      toastSuccess(`Deleted "${o?.headline}".`)
      renderOffersSection(container)
    })
  )
}

function checkTrademarks(container) {
  const form = container.querySelector('#offer-form')
  const text = [
    form.querySelector('[name=headline]').value,
    form.querySelector('[name=deal_text]').value,
    form.querySelector('[name=description]').value,
    form.querySelector('[name=stakes]').value,
    form.querySelector('[name=proof]').value,
    form.querySelector('[name=action]').value,
  ]
    .join(' ')
    .toLowerCase()

  const hit = TRADEMARK_FLAGS.find((flag) => text.includes(flag))
  const warning = container.querySelector('#trademark-warning')
  if (hit) {
    warning.textContent = `Possible unlicensed trademark reference ("${hit}"). Double-check this offer doesn't imply a team/league endorsement before approving a campaign for it.`
    warning.classList.remove('hidden')
  } else {
    warning.classList.add('hidden')
  }
}

function toggleVideoFields(container) {
  const offerType = container.querySelector('[name=offer_type]').value
  container.querySelector('#video-fields').classList.toggle('hidden', offerType !== 'video')
  toggleVideoUploadRow(container)
}

function toggleVideoUploadRow(container) {
  const isHosted = container.querySelector('[name=video_source]').value === 'hosted'
  container.querySelector('#video-upload-row').classList.toggle('hidden', !isHosted)
}

function setPreview(el, url, isVideo = false) {
  if (!url) {
    el.innerHTML = ''
    return
  }
  el.innerHTML = isVideo ? `<video src="${escapeHtml(url)}" muted></video>` : `<img src="${escapeHtml(url)}" alt="" />`
}

function wireUpload({ container, fileInputId, urlFieldName, statusId, previewId, uploadFn, isVideo }) {
  const fileInput = container.querySelector(`#${fileInputId}`)
  const urlField = container.querySelector(`[name=${urlFieldName}]`)
  const statusEl = container.querySelector(`#${statusId}`)
  const previewEl = previewId ? container.querySelector(`#${previewId}`) : null
  const defaultHint = statusEl.textContent

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]
    if (!file) return
    statusEl.className = 'field-hint text-white/70'
    statusEl.textContent = 'Uploading…'
    try {
      const url = await uploadFn(file)
      urlField.value = url
      if (previewEl) setPreview(previewEl, url, isVideo)
      statusEl.className = 'field-hint text-green-400'
      statusEl.textContent = 'Uploaded.'
    } catch (err) {
      statusEl.className = 'field-hint text-red-400'
      statusEl.textContent = err.message
    } finally {
      fileInput.value = ''
      setTimeout(() => {
        statusEl.className = 'field-hint'
        statusEl.textContent = defaultHint
      }, 2500)
    }
  })
}

function wireForm(container) {
  const form = container.querySelector('#offer-form')
  ;['headline', 'deal_text', 'description', 'stakes', 'proof', 'action'].forEach((name) => {
    form.querySelector(`[name=${name}]`).addEventListener('input', () => checkTrademarks(container))
  })

  form.querySelector('[name=offer_type]').addEventListener('change', () => toggleVideoFields(container))
  form.querySelector('[name=video_source]').addEventListener('change', () => toggleVideoUploadRow(container))

  wireUpload({
    container, fileInputId: 'media-input', urlFieldName: 'media_url',
    statusId: 'media-status', previewId: 'media-preview', uploadFn: uploadOfferImage,
  })
  wireUpload({
    container, fileInputId: 'poster-input', urlFieldName: 'video_poster_url',
    statusId: 'poster-status', previewId: 'poster-preview', uploadFn: uploadOfferPoster,
  })
  wireUpload({
    container, fileInputId: 'video-input', urlFieldName: 'video_url',
    statusId: 'video-status', previewId: 'video-preview', uploadFn: uploadOfferVideo, isVideo: true,
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#offer-error')
    errorEl.textContent = ''
    const fd = new FormData(form)
    const offerType = fd.get('offer_type')
    const isVideo = offerType === 'video'

    if (isVideo && fd.get('video_source') === 'hosted' && !fd.get('video_poster_url')) {
      errorEl.textContent = 'Hosted video needs a poster image URL — the tap target would be blank without one.'
      return
    }

    const payload = {
      vendor_id: fd.get('vendor_id'),
      headline: fd.get('headline'),
      deal_text: fd.get('deal_text') || null,
      description: fd.get('description') || null,
      offer_type: offerType,
      stakes: fd.get('stakes'),
      proof: fd.get('proof'),
      action: fd.get('action'),
      cta_url: fd.get('cta_url') || null,
      media_url: fd.get('media_url') || null,
      active: fd.get('active') === 'on',
      video_source: isVideo ? fd.get('video_source') : null,
      video_url: isVideo ? fd.get('video_url') || null : null,
      video_poster_url: isVideo ? fd.get('video_poster_url') || null : null,
      video_seconds: isVideo && fd.get('video_seconds') ? Number(fd.get('video_seconds')) : null,
    }
    if (editingId) payload.id = editingId

    try {
      await upsertOffer(payload)
      toastSuccess('Offer saved.')
      renderOffersSection(container)
    } catch (err) {
      errorEl.textContent = err.message
      toastError(err.message)
    }
  })
}

function fillForm(container, offer) {
  editingId = offer.id
  const form = container.querySelector('#offer-form')
  form.querySelector('[name=vendor_id]').value = offer.vendor_id ?? ''
  form.querySelector('[name=headline]').value = offer.headline ?? ''
  form.querySelector('[name=deal_text]').value = offer.deal_text ?? ''
  form.querySelector('[name=description]').value = offer.description ?? ''
  form.querySelector('[name=offer_type]').value = offer.offer_type ?? 'text'
  form.querySelector('[name=stakes]').value = offer.stakes ?? ''
  form.querySelector('[name=proof]').value = offer.proof ?? ''
  form.querySelector('[name=action]').value = offer.action ?? ''
  form.querySelector('[name=cta_url]').value = offer.cta_url ?? ''
  form.querySelector('[name=media_url]').value = offer.media_url ?? ''
  form.querySelector('[name=active]').checked = !!offer.active
  form.querySelector('[name=video_source]').value = offer.video_source ?? 'embed'
  form.querySelector('[name=video_url]').value = offer.video_url ?? ''
  form.querySelector('[name=video_poster_url]').value = offer.video_poster_url ?? ''
  form.querySelector('[name=video_seconds]').value = offer.video_seconds ?? ''
  setPreview(container.querySelector('#media-preview'), offer.media_url)
  setPreview(container.querySelector('#poster-preview'), offer.video_poster_url)
  setPreview(container.querySelector('#video-preview'), offer.video_source === 'hosted' ? offer.video_url : null, true)
  toggleVideoFields(container)
  checkTrademarks(container)
}

function resetForm(container) {
  editingId = null
  container.querySelector('#offer-form').reset()
  container.querySelector('#trademark-warning').classList.add('hidden')
  setPreview(container.querySelector('#media-preview'), null)
  setPreview(container.querySelector('#poster-preview'), null)
  setPreview(container.querySelector('#video-preview'), null)
  toggleVideoFields(container)
}
