import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  MessageSquare, LayoutDashboard, Users, BookOpen,
  Plug, Globe, LogOut, Settings2, ChevronLeft, ChevronRight, UserCog, Inbox,
} from 'lucide-react'
import { useAuth } from '../../store/auth'
import { useMe } from '../../store/me'
import AlmenaraMark from '../brand/AlmenaraMark'
import pkg from '../../../package.json'

// Each item declares the permission it requires. Items the current role
// can't access are filtered out; groups with no visible items are hidden.
const NAV_GROUPS = [
  {
    label: 'Plataforma',
    items: [
      { to: '/',               icon: LayoutDashboard, label: 'Overview',       end: true, perm: 'view_all_convs' },
      { to: '/inbox',          icon: MessageSquare,   label: 'Inbox',                     perm: 'view_all_convs' },
      { to: '/agent',          icon: Inbox,           label: 'Mi Bandeja',                perm: 'attend_convs' },
      { to: '/leads',          icon: Users,           label: 'Seguimientos',              perm: 'view_all_convs' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { to: '/agents',         icon: UserCog,  label: 'Agentes',       perm: 'manage_agents' },
      { to: '/knowledge',      icon: BookOpen, label: 'Conocimiento',  perm: 'configure_rules' },
      { to: '/integrations',   icon: Plug,     label: 'Canales',       perm: 'manage_channels' },
      { to: '/widget-test',    icon: Globe,    label: 'Prueba Widget', perm: 'manage_channels' },
    ],
  },
]

const INK   = '#0B1728'
const GOLD  = '#C09B3A'
const IVORY = '#FBF7EE'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const can = useMe(s => s.can)
  const role = useMe(s => s.role)

  // Filter items by role permission; drop groups that end up empty.
  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => can(it.perm)) }))
    .filter(g => g.items.length > 0)

  const canSettings = can('configure_rules') || can('view_billing')

  const W = collapsed ? 56 : 240

  return (
    <aside
      className="sidebar-geo"
      style={{
        width: W,
        minWidth: W,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: INK,
        borderRight: '1px solid rgba(192,155,58,0.18)',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 20,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: collapsed ? '16px 0' : '16px 20px',
        borderBottom: '1px solid rgba(192,155,58,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: '12px',
        overflow: 'hidden',
        transition: 'padding 0.22s',
      }}>
        {/* Almenara beacon mark */}
        <div style={{ width: '34px', height: '34px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlmenaraMark size={32} tower={GOLD} light="#D4B05A" pulse />
        </div>

        {/* Brand text — fades out when collapsed */}
        <div style={{
          overflow: 'hidden',
          maxWidth: collapsed ? 0 : '160px',
          opacity: collapsed ? 0 : 1,
          transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s',
          whiteSpace: 'nowrap',
        }}>
          <p style={{ color: IVORY, fontWeight: 700, fontSize: '15px', lineHeight: 1, letterSpacing: '3px', textTransform: 'uppercase', margin: 0, fontFamily: "Georgia, 'Palatino Linotype', serif" }}>
            Almenara
          </p>
          <p style={{ color: GOLD, fontSize: '8.5px', letterSpacing: '2.5px', textTransform: 'uppercase', margin: '4px 0 0' }}>
            Plataforma Omnicanal
          </p>
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: collapsed ? '16px 0' : '16px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {groups.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: gi < groups.length - 1 ? '20px' : 0 }}>
            {/* Group label */}
            {!collapsed && (
              <p style={{
                color: GOLD, fontSize: '9px', fontWeight: 700,
                letterSpacing: '2.5px', textTransform: 'uppercase',
                paddingLeft: '14px', marginBottom: '4px', opacity: 0.7,
              }}>
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && (
              <div style={{ height: '1px', background: 'rgba(192,155,58,0.12)', margin: '8px auto', width: '32px' }} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {group.items.map(({ to, icon: Icon, label, end }) => {
                const isActive = end ? location.pathname === to : location.pathname.startsWith(to)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    title={collapsed ? label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: '10px',
                      padding: collapsed ? '9px 0' : '8px 14px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      textDecoration: 'none',
                      color: isActive ? GOLD : 'rgba(251,247,238,0.52)',
                      background: isActive ? 'rgba(192,155,58,0.13)' : 'transparent',
                      borderLeft: (!collapsed && isActive) ? `2px solid ${GOLD}` : '2px solid transparent',
                      transition: 'all 0.12s',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(192,155,58,0.07)'
                    }}
                    onMouseLeave={e => {
                      if (!isActive) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <Icon size={15} style={{ flexShrink: 0 }} />

                    {/* Label — fades out when collapsed */}
                    <span style={{
                      flex: 1,
                      overflow: 'hidden',
                      maxWidth: collapsed ? 0 : '200px',
                      opacity: collapsed ? 0 : 1,
                      transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.12s',
                      whiteSpace: 'nowrap',
                    }}>
                      {label}
                    </span>

                    {/* Active dot (collapsed mode) */}
                    {collapsed && isActive && (
                      <span style={{
                        position: 'absolute',
                        left: '4px', top: '50%',
                        transform: 'translateY(-50%)',
                        width: '3px', height: '18px',
                        borderRadius: '2px',
                        background: GOLD,
                      }} />
                    )}

                    {/* Active dot (expanded mode) */}
                    {!collapsed && isActive && (
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: GOLD, flexShrink: 0,
                      }} />
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle button */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '10px 0',
          border: 'none',
          borderTop: '1px solid rgba(192,155,58,0.1)',
          borderBottom: '1px solid rgba(192,155,58,0.1)',
          background: 'transparent',
          color: 'rgba(251,247,238,0.25)',
          cursor: 'pointer',
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = GOLD
          e.currentTarget.style.background = 'rgba(192,155,58,0.07)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'rgba(251,247,238,0.25)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {collapsed
          ? <ChevronRight size={14} />
          : <ChevronLeft size={14} />
        }
      </button>

      {/* Footer */}
      <div style={{ padding: collapsed ? '10px 0' : '10px 8px' }}>
        {canSettings && (
        <NavLink
          to="/settings"
          title={collapsed ? 'Ajustes' : undefined}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '10px',
            padding: collapsed ? '8px 0' : '7px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: isActive ? 600 : 400,
            textDecoration: 'none',
            color: isActive ? GOLD : 'rgba(251,247,238,0.45)',
            background: isActive ? 'rgba(192,155,58,0.13)' : 'transparent',
            marginBottom: '2px',
            transition: 'all 0.12s',
          })}
        >
          <Settings2 size={15} style={{ flexShrink: 0 }} />
          <span style={{
            overflow: 'hidden',
            maxWidth: collapsed ? 0 : '200px',
            opacity: collapsed ? 0 : 1,
            transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.12s',
            whiteSpace: 'nowrap',
          }}>
            Ajustes
          </span>
        </NavLink>
        )}

        <button
          onClick={() => useAuth.getState().logout()}
          title={collapsed ? 'Cerrar sesión' : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '10px',
            padding: collapsed ? '8px 0' : '7px 14px',
            borderRadius: '8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {/* Avatar */}
          <div style={{
            width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
            background: 'rgba(192,155,58,0.13)',
            border: '1px solid rgba(192,155,58,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: GOLD, fontSize: '10px', fontWeight: 700,
          }}>
            A
          </div>

          {/* User info — fades out when collapsed */}
          <div style={{
            flex: 1, minWidth: 0, textAlign: 'left',
            overflow: 'hidden',
            maxWidth: collapsed ? 0 : '200px',
            opacity: collapsed ? 0 : 1,
            transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.12s',
            whiteSpace: 'nowrap',
          }}>
            <p style={{ color: 'rgba(251,247,238,0.85)', fontSize: '12px', fontWeight: 500, margin: 0 }}>
              {role === 'admin' ? 'Administrador' : role === 'supervisor' ? 'Supervisor' : 'Agente'}
            </p>
            <p style={{ color: 'rgba(251,247,238,0.3)', fontSize: '10px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              italam@alam.mx
            </p>
          </div>

          <LogOut size={12} style={{
            color: 'rgba(251,247,238,0.2)', flexShrink: 0,
            opacity: collapsed ? 0 : 1,
            transition: 'opacity 0.12s',
            maxWidth: collapsed ? 0 : '12px',
          }} />
        </button>

        {/* App version */}
        <p style={{
          color: 'rgba(251,247,238,0.22)',
          fontSize: '9px',
          letterSpacing: '0.5px',
          textAlign: 'center',
          margin: '6px 0 2px',
          height: collapsed ? 0 : 'auto',
          opacity: collapsed ? 0 : 1,
          overflow: 'hidden',
          transition: 'opacity 0.12s',
        }}>
          Almenara v{pkg.version}
        </p>
      </div>
    </aside>
  )
}
