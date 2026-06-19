import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import Overview from './features/overview/Overview'
import Inbox from './features/inbox/Inbox'
import Leads from './features/leads/Leads'
import Knowledge from './features/knowledge/Knowledge'
import Integrations from './features/integrations/Integrations'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen w-full overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/integrations" element={<Integrations />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
