import api from './api'

const BASE = '/conversations/channels'

export async function listChannels() {
  const { data } = await api.get(`${BASE}/`)
  return data.results ?? data
}

export async function createChannel(payload) {
  const { data } = await api.post(`${BASE}/`, payload)
  return data
}

export async function updateChannel(id, payload) {
  const { data } = await api.patch(`${BASE}/${id}/`, payload)
  return data
}

export async function deleteChannel(id) {
  await api.delete(`${BASE}/${id}/`)
}

export async function testChannel(id) {
  const { data } = await api.post(`${BASE}/${id}/test/`)
  return data
}
