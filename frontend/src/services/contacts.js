import api from './api'

export async function getFollowUps(status = '') {
  const params = status ? `?status=${status}` : ''
  const { data } = await api.get(`/contacts/followups/${params}`)
  return data.results ?? data
}

export async function getLeads() {
  const { data } = await api.get('/contacts/leads/')
  return data.results ?? data
}

export async function getHumanTakeoverConvs() {
  const { data } = await api.get('/conversations/?status=human_takeover')
  return data.results ?? data
}
