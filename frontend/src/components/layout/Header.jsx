import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, MessageSquare, AlertTriangle, X } from 'lucide-react'
import { useNotifications } from '../../store/notifications'

const CHANNEL_DOT = {
  whatsapp:  '#25D366',
  instagram: '#E1306C',
  messenger: '#0084FF',
  website:   '#C09B3A',
}

function timeLabel(min) {
  if (min < 1)  return 'ahora'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function NotificationPanel({ onClose }) {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleNotifClick = (n) => {
    markRead(n.id)
    onClose()
    navigate('/inbox')
  }

  return (
    <div ref={ref} style={{
      position: 'absolute',
      top: '48px', right: 0,
      width: '340px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      boxShadow: '0 12px 40px rgba(11,23,40,0.14), 0 2px 8px rgba(11,23,40,0.06)',
      zIndex: 100,
      overflow: 'hidden',
      animation: 'menuIn 0.14s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={14} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>
            Notificaciones
          </span>
          {unread > 0 && (
            <span style={{
              background: 'var(--crimson)', color: '#fff',
              fontSize: '9px', fontWeight: 700,
              padding: '1px 6px', borderRadius: '99px',
            }}>
              {unread}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {unread > 0 && (
            <button onClick={markAllRead} style={{
              fontSize: '10px', color: 'var(--gold)', fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
            }}>
              Marcar todas
            </button>
          )}
          <button onClick={onClose} aria-label="Cerrar notificaciones" style={{
            width: '22px', height: '22px', borderRadius: '6px',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)',
          }}>
            <X size={12} />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <Bell size={20} style={{ color: 'var(--border)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin notificaciones</p>
          </div>
        ) : (
          items.map(n => (
            <button
              key={n.id}
              onClick={() => handleNotifClick(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '11px',
                width: '100%', textAlign: 'left',
                padding: '11px 16px',
                borderBottom: '1px solid var(--sand)',
                background: n.read ? 'transparent' : n.urgent ? 'rgba(122,28,42,0.04)' : 'rgba(192,155,58,0.04)',
                border: 'none', cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--sand)')}
              onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : n.urgent ? 'rgba(122,28,42,0.04)' : 'rgba(192,155,58,0.04)')}
            >
              {/* Icon */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                background: n.urgent ? 'var(--crimson-pale)' : 'var(--gold-vp)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {n.urgent
                  ? <AlertTriangle size={14} style={{ color: 'var(--crimson)' }} />
                  : <MessageSquare size={14} style={{ color: 'var(--gold)' }} />
                }
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    color: n.urgent ? 'var(--crimson)' : 'var(--text-mid)',
                  }}>
                    {n.title}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>
                    {timeLabel(n.waitMinutes)}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.message}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                  <span style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: CHANNEL_DOT[n.channel] ?? 'var(--gold)',
                    boxShadow: `0 0 4px ${CHANNEL_DOT[n.channel] ?? 'var(--gold)'}80`,
                  }} />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Ver conversación →</span>
                </div>
              </div>

              {/* Unread dot */}
              {!n.read && (
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, marginTop: '4px',
                  background: n.urgent ? 'var(--crimson)' : 'var(--gold)',
                  boxShadow: `0 0 6px ${n.urgent ? 'rgba(122,28,42,0.5)' : 'rgba(192,155,58,0.5)'}`,
                }} />
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <button
            onClick={() => { onClose(); navigate('/leads') }}
            style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--gold)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Ver todos los seguimientos →
          </button>
        </div>
      )}
    </div>
  )
}

export default function Header({ title, subtitle }) {
  const [bellOpen, setBellOpen] = useState(false)
  const { unread } = useNotifications()

  return (
    <header style={{
      height: '56px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'inset 0 -1px 0 rgba(192,155,58,0.14)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: '16px',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)',
          fontFamily: "Georgia, 'Palatino Linotype', 'Book Antiqua', serif",
          lineHeight: 1.2, letterSpacing: '-0.2px',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1px' }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {/* Search */}
        <button aria-label="Buscar" style={{
          width: '32px', height: '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '8px', border: 'none', background: 'transparent',
          color: 'var(--text-muted)', cursor: 'pointer', transition: 'background 0.12s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--sand)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Search size={15} />
        </button>

        {/* Bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setBellOpen(o => !o)}
            aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
            aria-expanded={bellOpen}
            style={{
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '8px', border: 'none',
              background: bellOpen ? 'var(--gold-vp)' : 'transparent',
              color: bellOpen ? 'var(--gold)' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.12s', position: 'relative',
            }}
            onMouseEnter={e => { if (!bellOpen) e.currentTarget.style.background = 'var(--sand)' }}
            onMouseLeave={e => { if (!bellOpen) e.currentTarget.style.background = bellOpen ? 'var(--gold-vp)' : 'transparent' }}
          >
            <Bell size={15} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: '5px', right: '5px',
                minWidth: '14px', height: '14px',
                background: 'var(--crimson)',
                borderRadius: '99px', padding: '0 3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '8px', fontWeight: 700, color: '#fff',
                boxShadow: '0 0 6px rgba(122,28,42,0.5)',
                border: '1.5px solid var(--surface)',
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {bellOpen && <NotificationPanel onClose={() => setBellOpen(false)} />}
        </div>
      </div>
    </header>
  )
}
