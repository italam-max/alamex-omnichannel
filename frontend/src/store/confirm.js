import { create } from 'zustand'

// Imperative, promise-based confirm dialog — replaces window.confirm so
// confirmations match the Almenara identity instead of the browser chrome.
//
// Usage:  if (!(await confirm({ title, message, danger: true })) return
let resolver = null

export const useConfirm = create((set) => ({
  open: false,
  options: {},
  request: (options) =>
    new Promise((resolve) => {
      resolver = resolve
      set({ open: true, options })
    }),
  respond: (ok) => {
    set({ open: false })
    if (resolver) { resolver(ok); resolver = null }
  },
}))

export function confirm(options) {
  const opts = typeof options === 'string' ? { message: options } : (options || {})
  return useConfirm.getState().request(opts)
}
