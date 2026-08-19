const KEY = 'hhb_session_id'

// Ephemeral per-visit id: lives in sessionStorage, gone when the tab closes.
// Not a persistent identifier, not tied to a device or a person.
export function getSessionId() {
  let id = sessionStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(KEY, id)
  }
  return id
}
