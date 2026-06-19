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
