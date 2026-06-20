import { NavLink } from 'react-router-dom'
import {
  MessageSquare, LayoutDashboard, Users, BookOpen,
  Plug, Bot, Globe, LogOut, Settings2
} from 'lucide-react'
import { useAuth } from '../../store/auth'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/knowledge', icon: BookOpen, label: 'Conocimiento' },
  { to: '/integrations', icon: Plug, label: 'Canales' },
  { to: '/widget-test', icon: Globe, label: 'Prueba Widget' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 flex-shrink-0 bg-[#1a1a2e] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Alamex</p>
            <p className="text-white/40 text-[11px]">Omnichannel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer — Settings + logout */}
      <div className="p-3 border-t border-white/10 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-white/60 hover:bg-white/8 hover:text-white'
            }`
          }
        >
          <Settings2 size={17} />
          <span className="flex-1">Ajustes</span>
        </NavLink>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/8 cursor-pointer transition-colors group"
          onClick={() => useAuth.getState().logout()}
        >
          <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 text-xs font-semibold">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">Admin</p>
            <p className="text-white/40 text-[11px] truncate">italam@alam.mx</p>
          </div>
          <LogOut size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
        </div>
      </div>
    </aside>
  )
}
