import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useMe } from './store/me'
import { useNotifications } from './store/notifications'
import { mockConversations } from './mocks/conversations'
import api from './services/api'
import Sidebar from './components/layout/Sidebar'
import ConfirmDialog from './components/ui/ConfirmDialog'
import ErrorCenter from './components/ui/ErrorCenter'
import Login from './features/auth/Login'
import Overview from './features/overview/Overview'
import Inbox from './features/inbox/Inbox'
import Leads from './features/leads/Leads'
import Agents from './features/agents/Agents'
import AgentWorkspace from './features/agent/AgentWorkspace'
import Knowledge from './features/knowledge/Knowledge'
import Integrations from './features/integrations/Integrations'
import Settings from './features/settings/Settings'
import WidgetTest from './features/widget/WidgetTest'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const POLL_MS  = 30_000

// SLA thresholds come from the workspace business rules — never hardcoded.
const DEFAULT_SLA = { warning: 5, critical: 10, escalate: 15 }

function getSlaTier(waitMin, sla = DEFAULT_SLA) {
  if (waitMin < sla.warning)  return 'ok'
  if (waitMin < sla.critical) return 'warning'
  if (waitMin < sla.escalate) return 'critical'
  return 'escalated'
}

const TIER_TITLES = {
  warning:   'Aviso — sin respuesta',
  critical:  'Crítico — sin respuesta',
  escalated: 'Escalada — reasignación requerida',
}

function buildConvTiers(convs, sla = DEFAULT_SLA) {
  const now = Date.now()
  return convs
    .filter(c => c.status === 'human_takeover')
    .map(c => {
      const waitMin = Math.max(0, Math.floor((now - new Date(c.updated_at ?? c.created_at).getTime()) / 60_000))
      const tier    = getSlaTier(waitMin, sla)
      const name    = c.contact?.name ?? c.contact_name ?? 'Contacto'
      return {
        convId: c.id,
        tier,
        alertData: tier !== 'ok' ? {
          id:          `${c.id}-${tier}`,
          type:        'sla_tier',
          tier,
          convId:      c.id,
          contactName: name,
          channel:     c.channel?.type ?? c.channel_type ?? 'whatsapp',
          waitMinutes: waitMin,
          urgent:      tier === 'critical' || tier === 'escalated',
          read:        false,
          title:       TIER_TITLES[tier],
          message:     `${name} lleva ${waitMin} min sin respuesta`,
          createdAt:   new Date().toISOString(),
        } : null,
      }
    })
}

function useNotificationPoller() {
  const { syncConvTiers } = useNotifications()

  useEffect(() => {
    let cancelled = false
    let sla = DEFAULT_SLA

    // Load the configured SLA thresholds once (cheap, cached for the session).
    if (!USE_MOCK) {
      api.get('/accounts/workspace/', { meta: { silent: true } })
        .then(({ data }) => {
          sla = {
            warning:  data.sla_warning_minutes  ?? DEFAULT_SLA.warning,
            critical: data.sla_critical_minutes ?? DEFAULT_SLA.critical,
            escalate: data.sla_escalate_minutes ?? DEFAULT_SLA.escalate,
          }
        })
        .catch(() => { /* keep defaults */ })
    }

    const poll = async () => {
      try {
        let convs
        if (USE_MOCK) {
          convs = mockConversations
        } else {
          const { data } = await api.get('/conversations/?status=human_takeover', { meta: { silent: true } })
          convs = data.results ?? data
        }
        if (!cancelled) syncConvTiers(buildConvTiers(convs, sla))
      } catch { /* ignore — offline or auth error */ }
    }

    poll()
    const iv = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [syncConvTiers])
}

// Permission required to view each route. Routes not listed are open to
// any authenticated user.
const ROUTE_PERM = {
  '/':             'view_all_convs',
  '/inbox':        'view_all_convs',
  '/leads':        'view_all_convs',
  '/agents':       'manage_agents',
  '/knowledge':    'configure_rules',
  '/integrations': 'manage_channels',
  '/settings':     'configure_rules',
  '/widget-test':  'manage_channels',
}

// Wraps a route element; redirects to the role's home when not permitted.
function Guard({ perm, children }) {
  const loaded = useMe(s => s.loaded)
  const can    = useMe(s => s.can)
  if (!loaded) return null            // wait for perms to avoid a wrong redirect
  if (perm && !can(perm)) {
    return <Navigate to={can('view_all_convs') ? '/' : '/agent'} replace />
  }
  return children
}

function PrivateLayout() {
  useNotificationPoller()
  const loadMe = useMe(s => s.loadMe)

  useEffect(() => { loadMe() }, [loadMe])

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--sand)' }}>
      <ConfirmDialog />
      <ErrorCenter />
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <Routes>
          <Route path="/"             element={<Guard perm={ROUTE_PERM['/']}><Overview /></Guard>} />
          <Route path="/inbox"        element={<Guard perm={ROUTE_PERM['/inbox']}><Inbox /></Guard>} />
          <Route path="/agent"        element={<AgentWorkspace />} />
          <Route path="/leads"        element={<Guard perm={ROUTE_PERM['/leads']}><Leads /></Guard>} />
          <Route path="/agents"       element={<Guard perm={ROUTE_PERM['/agents']}><Agents /></Guard>} />
          <Route path="/knowledge"    element={<Guard perm={ROUTE_PERM['/knowledge']}><Knowledge /></Guard>} />
          <Route path="/integrations" element={<Guard perm={ROUTE_PERM['/integrations']}><Integrations /></Guard>} />
          <Route path="/settings"     element={<Guard perm={ROUTE_PERM['/settings']}><Settings /></Guard>} />
          <Route path="/widget-test"  element={<Guard perm={ROUTE_PERM['/widget-test']}><WidgetTest /></Guard>} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  const { isAuthenticated } = useAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/*"     element={isAuthenticated ? <PrivateLayout />    : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
