import axios from 'axios'
import { getToken } from '../store/auth'
import { reportError } from '../store/errors'

const REFRESH_KEY = 'alamex_refresh'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem(REFRESH_KEY)
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${api.defaults.baseURL}/auth/token/refresh/`,
            { refresh },
          )
          localStorage.setItem('alamex_access', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          // refresh failed — let the caller handle the 401
        }
      }
    }

    // Log genuine breakages (network down or 5xx) as trackable incidents.
    // 4xx (validation/permission) stay caller-handled and shown inline.
    const status = error.response?.status
    const silent = error.config?.meta?.silent
    if (!silent && (!status || status >= 500)) {
      reportError(error, 'Error de comunicación con el servidor')
    }
    return Promise.reject(error)
  },
)

export default api
