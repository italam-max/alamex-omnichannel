import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useNotifications } from './store/notifications'
import { mockConversations } from './mocks/conversations'
import api from './services/api'
import Sidebar from './components/layout/Sidebar'
import Login from './features/auth/Login'
import Overview from './features/overview/Overview'
import Inbox from './features/inbox/Inbox'
import Leads from './features/leads/Leads'
import Knowledge from './features/knowledge/Knowledge'
import Integrations from './features/integrations/Integrations'
import Settings from './features/settings/Settings'
import WidgetTest from './features/widget/WidgetTest'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const POLL_MS  = 30_000
const URGENT_AFTER_MIN = 10  // minutes without agent reply = urgent

// Build notification alerts from conversations in human_takeover
function buildAlerts(convs) {
  const now = Date.now()
  return convs
    .filter(c => c.status === 'human_takeover')
    .map(c => {
      const lastTs   = new Date(c.updated_at ?? c.created_at).getTime()
      const waitMin  = Math.floor((now - lastTs) / 60_000)
      const name     = c.contact?.name ?? c.contact_name ?? 'Contacto'
      const urgent   = waitMin >= URGENT_AFTER_MIN
      return {
        id:          `human-${c.id}`,
        type:        'conv_waiting',
        convId:      c.id,
        contactName: name,
        channel:     c.channel?.type ?? c.channel_type ?? 'whatsapp',
        waitMinutes: waitMin,
        urgent,
        read:        false,
        title:       urgent ? 'Sin respuesta — urgente' : 'Esperando agente',
        message:     `${name} lleva ${waitMin} min esperando respuesta`,
        createdAt:   new Date().toISOString(),
      }
    })
    .filter(n => n.waitMinutes >= 2)
    .sort((a, b) => b.waitMinutes - a.waitMinutes)
}

function useNotificationPoller() {
  const { syncAlerts } = useNotifications()

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        let convs
        if (USE_MOCK) {
          convs = mockConversations
        } else {
          const { data } = await api.get('/conversations/?status=human_takeover')
          convs = data.results ?? data
        }
        if (!cancelled) syncAlerts(buildAlerts(convs))
      } catch { /* ignore — offline or auth error */ }
    }

    poll()
    const iv = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [syncAlerts])
}

function PrivateLayout() {
  useNotificationPoller()

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--sand)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <Routes>
          <Route path="/"             element={<Overview />} />
          <Route path="/inbox"        element={<Inbox />} />
          <Route path="/leads"        element={<Leads />} />
          <Route path="/knowledge"    element={<Knowledge />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings"     element={<Settings />} />
          <Route path="/widget-test"  element={<WidgetTest />} />
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
