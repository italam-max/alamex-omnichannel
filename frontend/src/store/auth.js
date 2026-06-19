import { create } from 'zustand'

const TOKEN_KEY = 'alamex_access'
const REFRESH_KEY = 'alamex_refresh'

export const useAuth = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),

  login: (access, refresh) => {
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
    set({ token: access, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    set({ token: null, isAuthenticated: false })
  },
}))

export const getToken = () => localStorage.getItem(TOKEN_KEY)
