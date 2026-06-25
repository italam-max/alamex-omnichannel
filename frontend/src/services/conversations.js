import api from './api'

export async function getConversations() {
  const { data } = await api.get('/conversations/')
  return data.results ?? data
}

export async function getConversation(id) {
  const { data } = await api.get(`/conversations/${id}/`)
  return data
}

export async function getChannels() {
  const { data } = await api.get('/conversations/channels/')
  return data.results ?? data
}

export async function sendAgentMessage(conversationId, content) {
  const { data } = await api.post(`/conversations/${conversationId}/messages/`, { content })
  return data
}

export async function toggleAiActive(conversationId, ai_active) {
  const { data } = await api.patch(`/conversations/${conversationId}/update/`, { ai_active })
  return data
}

// ── Agent workspace ─────────────────────────────────────────────────
export async function getMyConversations() {
  const { data } = await api.get('/conversations/?assigned=me')
  return data.results ?? data
}

export async function getQueue() {
  const { data } = await api.get('/conversations/?queue=true')
  return data.results ?? data
}

export async function claimConversation(id) {
  const { data } = await api.post(`/conversations/${id}/claim/`)
  return data
}

export async function releaseConversation(id) {
  const { data } = await api.post(`/conversations/${id}/release/`)
  return data
}

export async function closeConversation(id) {
  const { data } = await api.patch(`/conversations/${id}/update/`, { status: 'blocked' })
  return data
}

export async function getMyFollowups() {
  const { data } = await api.get('/contacts/followups/?mine=true&status=open&status=in_progress')
  return data.results ?? data
}

export async function setFollowupStatus(id, status) {
  const { data } = await api.patch(`/contacts/followups/${id}/set-status/`, { status })
  return data
}
