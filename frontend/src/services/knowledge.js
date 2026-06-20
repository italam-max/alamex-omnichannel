import api from './api'

// ── AI Config (singleton) ─────────────────────────────────────────

export async function getAIConfig() {
  const { data } = await api.get('/knowledge/config/')
  return data
}

export async function saveAIConfig(payload) {
  const { data } = await api.patch('/knowledge/config/', payload)
  return data
}

// ── Knowledge Documents ───────────────────────────────────────────

export async function listDocs() {
  const { data } = await api.get('/knowledge/docs/')
  return data
}

export async function createDoc(payload) {
  const { data } = await api.post('/knowledge/docs/', payload)
  return data
}

export async function updateDoc(id, payload) {
  const { data } = await api.patch(`/knowledge/docs/${id}/`, payload)
  return data
}

export async function deleteDoc(id) {
  await api.delete(`/knowledge/docs/${id}/`)
}

// ── Scraper ───────────────────────────────────────────────────────

export async function scrapeWebsite(payload) {
  const { data } = await api.post('/knowledge/scrape/', payload)
  return data
}
