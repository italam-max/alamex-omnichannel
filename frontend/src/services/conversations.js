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
