import { create } from 'zustand'

// Tier escalation order — only notify when going UP
const TIER_ORDER = { ok: 0, warning: 1, critical: 2, escalated: 3 }

export const useNotifications = create((set) => ({
  items:   [],       // notification history — accumulates, max 100
  unread:  0,
  tierMap: {},       // { [convId]: 'ok' | 'warning' | 'critical' | 'escalated' }

  markRead: (id) => set(s => {
    const items = s.items.map(n => n.id === id ? { ...n, read: true } : n)
    return { items, unread: items.filter(n => !n.read).length }
  }),

  markAllRead: () => set(s => ({
    items: s.items.map(n => ({ ...n, read: true })),
    unread: 0,
  })),

  // Called from poller every 30s with [{ convId, tier, alertData }]
  // Adds a notification only when a conversation's tier escalates (goes up)
  syncConvTiers: (convTiers) => set(s => {
    let items = [...s.items]
    const tierMap = { ...s.tierMap }
    let hasNew = false

    for (const { convId, tier, alertData } of convTiers) {
      const prev = tierMap[String(convId)] ?? 'ok'
      tierMap[String(convId)] = tier

      if (alertData && TIER_ORDER[tier] > TIER_ORDER[prev]) {
        // Tier escalated — prepend notification, dedup by id
        items = [alertData, ...items.filter(n => n.id !== alertData.id)]
        hasNew = true
      }
    }

    // Drop tierMap entries for convs no longer in human_takeover
    const activeIds = new Set(convTiers.map(ct => String(ct.convId)))
    for (const convId of Object.keys(tierMap)) {
      if (!activeIds.has(convId)) delete tierMap[convId]
    }

    const trimmed = items.slice(0, 100)
    return {
      items: trimmed,
      unread: hasNew
        ? trimmed.filter(n => !n.read).length
        : s.unread,
      tierMap,
    }
  }),
}))
