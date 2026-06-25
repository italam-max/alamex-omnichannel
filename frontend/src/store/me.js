import { create } from 'zustand'
import { getMe } from '../services/accounts'

// Full capability map (granted only on a successful admin/superuser load).
const ALL_PERMS = {
  manage_agents:   true,
  configure_rules: true,
  manage_channels: true,
  view_all_convs:  true,
  reassign:        true,
  view_billing:    true,
  attend_convs:    true,
}

// Fail-closed baseline: the least an authenticated user can do. Used while
// `me` is loading and — critically — if the request fails. A backend hiccup
// must never silently grant admin (the backend already synthesizes an admin
// identity for real superusers, so this only ever downgrades on real errors).
const MINIMAL_PERMS = { attend_convs: true }

export const useMe = create((set, get) => ({
  me:          null,
  loaded:      false,
  role:        null,
  permissions: MINIMAL_PERMS,

  loadMe: async () => {
    try {
      const me = await getMe()
      set({
        me,
        loaded:      true,
        role:        me.role ?? 'agent',
        permissions: me.is_superuser ? ALL_PERMS : (me.permissions ?? MINIMAL_PERMS),
      })
    } catch {
      // Offline / server error → fail closed to the minimal capability set.
      set({ loaded: true, role: 'agent', permissions: MINIMAL_PERMS })
    }
  },

  can: (perm) => !!get().permissions?.[perm],
}))
