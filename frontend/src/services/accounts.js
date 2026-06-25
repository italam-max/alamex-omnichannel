import api from './api'

// ── Workspace (business rules) ──────────────────────────────────────
export async function getWorkspace() {
  const { data } = await api.get('/accounts/workspace/')
  return data
}

export async function updateWorkspace(patch) {
  const { data } = await api.patch('/accounts/workspace/update/', patch)
  return data
}

// ── Agents ──────────────────────────────────────────────────────────
export async function getAgents() {
  const { data } = await api.get('/accounts/agents/')
  return data.results ?? data
}

export async function getMe() {
  const { data } = await api.get('/accounts/agents/me/')
  return data
}

export async function createAgent(payload) {
  const { data } = await api.post('/accounts/agents/', payload)
  return data
}

export async function updateAgent(id, patch) {
  const { data } = await api.patch(`/accounts/agents/${id}/`, patch)
  return data
}

export async function deactivateAgent(id) {
  await api.delete(`/accounts/agents/${id}/`)
}

export async function reactivateAgent(id) {
  const { data } = await api.post(`/accounts/agents/${id}/reactivate/`)
  return data
}

export async function setAvailability(id, availability) {
  const { data } = await api.patch(`/accounts/agents/${id}/availability/`, { availability })
  return data
}

// ── SLA alerts ──────────────────────────────────────────────────────
export async function getAlerts(openOnly = true) {
  const { data } = await api.get(`/accounts/alerts/${openOnly ? '?open=true' : ''}`)
  return data.results ?? data
}

export async function scanSla() {
  const { data } = await api.post('/accounts/alerts/scan/')
  return data
}

export async function resolveAlert(id) {
  const { data } = await api.post(`/accounts/alerts/${id}/resolve/`)
  return data
}

// ── Reassignment + stats ────────────────────────────────────────────
export async function reassignConversation(conversationId, agentId) {
  const { data } = await api.post('/accounts/reassign/', {
    conversation: conversationId, agent: agentId,
  })
  return data
}

export async function getTeamStats() {
  const { data } = await api.get('/accounts/stats/')
  return data
}
