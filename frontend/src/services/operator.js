import api from './api'
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

// ── Operator console (superuser) ──────────────────────────────────
export async function listOrgs() {
  const { data } = await api.get('/operator/orgs/')
  return data
}
export async function getOrg(slug) {
  const { data } = await api.get(`/operator/orgs/${slug}/`)
  return data
}
export async function createOrg(payload) {
  const { data } = await api.post('/operator/orgs/', payload)
  return data
}
export async function setOrgActive(slug, active) {
  const { data } = await api.post(`/operator/orgs/${slug}/${active ? 'activate' : 'suspend'}/`)
  return data
}
export async function rechargeCredits(slug, amountUsd) {
  const { data } = await api.post(`/operator/orgs/${slug}/credits/`, { amount_usd: amountUsd })
  return data
}
export async function reissueInvite(slug) {
  const { data } = await api.post(`/operator/orgs/${slug}/invite/`)
  return data
}

// Build the shareable absolute access link from a token (this app's origin).
export function accessLinkUrl(link) {
  if (!link) return ''
  return link.url || `${window.location.origin}${link.path}`
}

// ── Public invite (no auth) ───────────────────────────────────────
export async function getInvite(token) {
  const { data } = await axios.get(`${BASE}/invite/${token}/`)
  return data
}
export async function acceptInvite(token, password) {
  const { data } = await axios.post(`${BASE}/invite/${token}/accept/`, { password })
  return data
}
