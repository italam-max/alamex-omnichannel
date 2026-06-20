import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import Sidebar from './components/layout/Sidebar'
import Login from './features/auth/Login'
import Overview from './features/overview/Overview'
import Inbox from './features/inbox/Inbox'
import Leads from './features/leads/Leads'
import Knowledge from './features/knowledge/Knowledge'
import Integrations from './features/integrations/Integrations'
import Settings from './features/settings/Settings'
import WidgetTest from './features/widget/WidgetTest'

function PrivateLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/widget-test" element={<WidgetTest />} />
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
        <Route path="/*" element={isAuthenticated ? <PrivateLayout /> : <Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
