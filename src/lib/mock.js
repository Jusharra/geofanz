// Local dev fallback so the fan page is fully clickable before Supabase
// exists. Only used when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
// unset — see lib/supabase.js. Never shipped against a real deploy.

const SCENARIOS = ['offers', 'empty', 'outside']
const KEY = 'hhb_mock_scenario'

export function getScenario() {
  return localStorage.getItem(KEY) || 'offers'
}

export function setScenario(scenario) {
  if (!SCENARIOS.includes(scenario)) return
  localStorage.setItem(KEY, scenario)
}

export function mockLiveOffers() {
  if (getScenario() !== 'offers') return []
  const endsAt = new Date(Date.now() + 45 * 60 * 1000).toISOString()
  return [
    {
      campaign_id: 'mock-campaign-1',
      offer_id: 'mock-offer-1',
      venue_id: 'mock-venue-1',
      venue_name: "Valley Children's Stadium",
      vendor_name: 'Tioga-Sequoia Brewing',
      offer_type: 'text',
      headline: '2-for-1 pints',
      description: 'Show this screen at the tap.',
      deal_text: '2 for $12',
      stakes: 'Game-day only — gone at final whistle.',
      proof: '12 years on Blackstone.',
      action: 'Show this at the red truck by Gate 3.',
      display_code: 'BULLDOG24',
      media_url: null,
      cta_url: null,
      distance_m: 210,
      ends_at: endsAt,
    },
    {
      campaign_id: 'mock-campaign-2',
      offer_id: 'mock-offer-2',
      venue_id: 'mock-venue-1',
      venue_name: "Valley Children's Stadium",
      vendor_name: "Rick's Drive In",
      offer_type: 'text',
      headline: '$5 off any combo',
      description: null,
      deal_text: '$5 off',
      stakes: null,
      proof: null,
      action: null,
      display_code: 'HOTHAND5',
      media_url: null,
      cta_url: null,
      distance_m: 340,
      ends_at: endsAt,
    },
  ]
}

export function mockFenceCheck() {
  if (getScenario() === 'outside') return null
  return {
    venue_id: 'mock-venue-1',
    venue_name: "Valley Children's Stadium",
    distance_m: 260,
  }
}

// Dev-mock stand-in for the issue_redemption_token RPC.
export function mockIssueToken() {
  return {
    token: crypto.randomUUID(),
    short_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
  }
}
