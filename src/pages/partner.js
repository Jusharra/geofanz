import '../style.css'
import { supabase, supabaseConfigured } from '../lib/supabase.js'

const root = document.getElementById('partner-app')

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str ?? ''
  return div.innerHTML
}

function render() {
  root.innerHTML = `
    <h2 class="text-2xl font-black mb-2">Partner With Us</h2>
    <p class="text-white/60 text-sm mb-6">Tell us a little about your business and we'll get you set up before the next event.</p>

    <form id="partner-form" class="space-y-4">
      <div>
        <label class="field-label" for="business_name">Business name</label>
        <input id="business_name" name="business_name" required class="field-input" />
      </div>
      <div>
        <label class="field-label" for="contact_name">Your name</label>
        <input id="contact_name" name="contact_name" required class="field-input" />
      </div>
      <div>
        <label class="field-label" for="contact_info">Phone or email</label>
        <input id="contact_info" name="contact_info" required class="field-input" />
      </div>
      <div>
        <label class="field-label" for="sells">What you sell</label>
        <input id="sells" name="sells" placeholder="Tacos, merch, rideshare discount…" class="field-input" />
      </div>
      <div>
        <label class="field-label" for="event_interest">Which event do you want to be in?</label>
        <input id="event_interest" name="event_interest" placeholder="e.g. Oct 10 vs. Boise State, or 'the whole season'" class="field-input" />
      </div>
      <button type="submit" class="btn-primary w-full">Submit</button>
      <p id="partner-status" class="text-sm text-center"></p>
    </form>

    <p class="text-white/40 text-xs mt-6 text-center">We'll reach out within one business day. If you'd rather just talk: <span class="placeholder">[PHONE]</span></p>
  `

  const form = document.getElementById('partner-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('partner-status')
    const submitBtn = form.querySelector('button[type=submit]')
    statusEl.className = 'text-sm text-center'
    statusEl.textContent = ''

    if (!supabaseConfigured) {
      statusEl.className = 'text-sm text-center text-red-400'
      statusEl.textContent = 'Not configured in this environment.'
      return
    }

    const fd = new FormData(form)
    submitBtn.disabled = true
    const { error } = await supabase.from('partner_leads').insert({
      business_name: fd.get('business_name'),
      contact_name: fd.get('contact_name'),
      contact_info: fd.get('contact_info'),
      sells: fd.get('sells') || null,
      event_interest: fd.get('event_interest') || null,
    })

    if (error) {
      statusEl.className = 'text-sm text-center text-red-400'
      statusEl.textContent = "Something went wrong — mind trying again in a moment?"
      submitBtn.disabled = false
      return
    }

    root.innerHTML = `
      <h2 class="text-2xl font-black mb-2">Thanks, ${escapeHtml(fd.get('contact_name'))}.</h2>
      <p class="text-white/60 text-sm">We've got your info for <strong class="text-white/85">${escapeHtml(fd.get('business_name'))}</strong> and we'll reach out within one business day.</p>
    `
  })
}

render()
