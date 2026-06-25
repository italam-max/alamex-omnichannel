import { create } from 'zustand'

// Trackable, persistent incident log — NOT ephemeral toasts. Every error gets a
// code (ALM-XXXXX), stays on screen until dismissed, and is kept in a history
// (localStorage) the user can review and report later.
const STORE_KEY = 'almenara_incidents'
const MAX = 50
const DEDUP_MS = 30_000

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') } catch { return [] }
}
function persist(log) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(log.slice(0, MAX))) } catch { /* quota */ }
}

function makeCode() {
  const t = Date.now().toString(36).toUpperCase().slice(-5)
  const r = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0')
  return `ALM-${t}${r}`
}

export const useErrors = create((set, get) => ({
  log: load(),     // full persisted history
  active: [],      // cards currently shown (until dismissed)

  capture: (info) => {
    const endpoint = info.endpoint || ''
    const status = info.status ?? null
    // Collapse repeated identical failures (e.g. a poller looping offline).
    const sig = `${endpoint}|${status}|${info.context || ''}`
    const recent = get().log[0]
    if (recent && `${recent.endpoint}|${recent.status}|${recent.context}` === sig &&
        Date.now() - new Date(recent.at).getTime() < DEDUP_MS) {
      return recent.code
    }

    const entry = {
      code: makeCode(),
      title: info.title || 'Ocurrió un error',
      message: info.message || 'Algo salió mal. Intenta de nuevo.',
      detail: info.detail || '',
      context: info.context || '',
      status, endpoint,
      at: new Date().toISOString(),
    }
    const log = [entry, ...get().log].slice(0, MAX)
    persist(log)
    set({ log, active: [entry, ...get().active].slice(0, 4) })
    return entry.code
  },

  dismiss: (code) => set({ active: get().active.filter(e => e.code !== code) }),
  dismissAll: () => set({ active: [] }),
  clearLog: () => { persist([]); set({ log: [], active: [] }) },
}))

// Format a copy-paste report for support / deeper review.
export function formatReport(e) {
  return [
    `Incidencia ${e.code}`,
    `Fecha: ${e.at}`,
    e.context ? `Acción: ${e.context}` : null,
    e.endpoint ? `Petición: ${e.endpoint}` : null,
    e.status != null ? `Estado HTTP: ${e.status}` : null,
    e.detail ? `Detalle: ${e.detail}` : null,
    `Mensaje: ${e.message}`,
  ].filter(Boolean).join('\n')
}

// Imperative helper for axios catch blocks / interceptor.
export function reportError(error, context = '') {
  const resp = error?.response
  const status = resp?.status ?? null
  const cfg = error?.config || {}
  const endpoint = cfg.url ? `${(cfg.method || 'GET').toUpperCase()} ${cfg.url}` : ''
  const serverMsg =
    resp?.data?.detail || resp?.data?.error ||
    (typeof resp?.data === 'string' ? resp.data.slice(0, 200) : '') ||
    error?.message || ''
  const message = status
    ? `El servidor respondió con un error (${status}). El equipo puede revisarlo con el código.`
    : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
  return useErrors.getState().capture({
    title: context || 'Error de operación',
    message, detail: serverMsg, context, status, endpoint,
  })
}
