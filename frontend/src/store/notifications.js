import { create } from 'zustand'

export const useNotifications = create((set, get) => ({
  items: [],
  unread: 0,

  setItems: (items) => set({
    items,
    unread: items.filter(n => !n.read).length,
  }),

  markRead: (id) => set(s => {
    const items = s.items.map(n => n.id === id ? { ...n, read: true } : n)
    return { items, unread: items.filter(n => !n.read).length }
  }),

  markAllRead: () => set(s => ({
    items: s.items.map(n => ({ ...n, read: true })),
    unread: 0,
  })),

  // called from useNotificationPoller — merges new alerts preserving read state
  syncAlerts: (incoming) => set(s => {
    const readSet = new Set(s.items.filter(n => n.read).map(n => n.id))
    const items = incoming.map(n => ({ ...n, read: readSet.has(n.id) }))
    return { items, unread: items.filter(n => !n.read).length }
  }),
}))
