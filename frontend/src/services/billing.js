import api from './api'

export async function getAccount() {
  const { data } = await api.get('/billing/account/')
  return data
}

export async function updateAccount(payload) {
  const { data } = await api.patch('/billing/account/', payload)
  return data
}

export async function topup(amount_usd, description) {
  const { data } = await api.post('/billing/topup/', { amount_usd, description })
  return data
}

export async function getTransactions() {
  const { data } = await api.get('/billing/transactions/')
  return data
}

export async function getUsageStats() {
  const { data } = await api.get('/billing/usage/')
  return data
}
