import { useState, useEffect, useRef, useCallback } from 'react'
import { mockConversations, mockMessages } from '../../mocks/conversations'
import { getConversations, getConversation, sendAgentMessage, toggleAiActive } from '../../services/conversations'
import api from '../../services/api'
import {
  Bot, User, Search, Send, Loader, RefreshCw,
  Phone, MoreVertical, Sparkles,
  CheckCircle, Ban, UserX, Download, AlertTriangle,
} from 'lucide-react'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60)    return 'ahora'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function renderMd(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(192,155,58,0.12);padding:1px 5px;border-radius:4px;font-size:0.9em">$1</code>')
    .replace(/\n/g, '<br/>')
}

// ── Config ───────────────────────────────────────────────────────────────────

const CHANNEL_CFG = {
  whatsapp:  { label: 'WhatsApp', dot: '#25D366', bg: 'rgba(37,211,102,0.10)', text: '#166534' },
  instagram: { label: 'Instagram', dot: '#E1306C', bg: 'rgba(225,48,108,0.10)', text: '#9A1040' },
  messenger: { label: 'Messenger', dot: '#0084FF', bg: 'rgba(0,132,255,0.10)', text: '#1E40AF' },
  website:   { label: 'Web', dot: 'var(--gold)', bg: 'var(--gold-vp)', text: 'var(--text-mid)' },
}

const STATUS_CFG = {
  active:         { label: 'Activa',    bg: 'var(--jade-pale)',    text: 'var(--jade)' },
  human_takeover: { label: 'Humano',    bg: '#FEF3C7',             text: '#92400E' },
  blocked:        { label: 'Bloqueada', bg: 'var(--sand-2)',       text: 'var(--text-muted)' },
}

const AVATAR_BG = [
  'rgba(192,155,58,0.18)',
  'rgba(26,92,58,0.15)',
  'rgba(122,28,42,0.12)',
  'rgba(59,106,168,0.14)',
  'rgba(139,94,131,0.14)',
]
const AVATAR_TEXT = [
  'var(--gold)',
  'var(--jade)',
  'var(--crimson)',
  '#3B6AA8',
  '#8B5E83',
]

function avatarStyle(name, size = 36) {
  const idx = (name?.charCodeAt(0) ?? 0) % AVATAR_BG.length
  return {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: AVATAR_BG[idx],
    border: `1.5px solid ${AVATAR_TEXT[idx]}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.33, fontWeight: 700,
    color: AVATAR_TEXT[idx],
    letterSpacing: '-0.5px',
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ChannelPill({ type }) {
  const c = CHANNEL_CFG[type] ?? CHANNEL_CFG.website
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 8px', borderRadius: '99px',
      background: c.bg, color: c.text,
      fontSize: '10px', fontWeight: 600, letterSpacing: '0.2px',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}

function StatusPill({ status }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.active
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '99px',
      background: c.bg, color: c.text,
      fontSize: '10px', fontWeight: 600,
    }}>
      {c.label}
    </span>
  )
}

function AiToggle({ active, onToggle }) {
  return (
    <button
      className={`ai-toggle-track ${active ? 'on' : 'off'}`}
      onClick={onToggle}
      title={active ? 'Desactivar IA' : 'Activar IA'}
    >
      <span className="ai-toggle-thumb" />
    </button>
  )
}

function ConvItem({ conv, active, onClick }) {
  const name          = conv.contact?.name ?? conv.contact_name ?? 'Sin nombre'
  const channelType   = conv.channel?.type ?? conv.channel_type ?? 'whatsapp'
  const lastMsg       = conv.last_message ?? conv.messages?.[conv.messages.length - 1]?.content ?? '—'
  const updatedAt     = conv.updated_at ?? conv.created_at
  const unread        = conv.unread ?? 0
  const isHuman       = conv.status === 'human_takeover'

  return (
    <button
      className={`conv-item ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <div style={{ position: 'relative', marginRight: '11px', flexShrink: 0 }}>
        <div style={avatarStyle(name, 38)}>
          {initials(name)}
        </div>
        {/* AI / human status dot with neon glow */}
        <span style={{
          position: 'absolute', bottom: 0, right: 0,
          width: '10px', height: '10px', borderRadius: '50%',
          background: conv.ai_active ? 'var(--gold)' : isHuman ? '#D97706' : 'var(--sand-2)',
          border: '1.5px solid var(--surface)',
          boxShadow: conv.ai_active
            ? '0 0 6px rgba(192,155,58,0.6)'
            : isHuman ? '0 0 5px rgba(217,119,6,0.5)' : 'none',
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{
            fontSize: '13px', fontWeight: active ? 700 : 600,
            color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, marginRight: '8px',
          }}>
            {name}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
            {updatedAt && timeAgo(updatedAt)}
          </span>
        </div>

        <p style={{
          fontSize: '11px', color: unread ? 'var(--text-mid)' : 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          margin: '0 0 6px', fontWeight: unread ? 500 : 400,
        }}>
          {lastMsg}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <ChannelPill type={channelType} />
          <StatusPill status={conv.status} />
          {unread > 0 && (
            <span style={{
              marginLeft: 'auto',
              background: 'var(--crimson)', color: '#fff',
              fontSize: '9px', fontWeight: 700,
              padding: '1px 6px', borderRadius: '99px',
              minWidth: '16px', textAlign: 'center',
            }}>
              {unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function DateDivider({ label }) {
  return <div className="date-chip">{label}</div>
}

function MessageBubble({ msg }) {
  const isCustomer = msg.role === 'customer'   // incoming → LEFT
  const isAi       = msg.role === 'ai'          // outgoing → RIGHT
  const isOutgoing = !isCustomer                 // ai or human agent

  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: isOutgoing ? 'row-reverse' : 'row',  // outgoing on right, incoming on left
      gap: '8px',
      alignItems: 'flex-end',
    }}>
      {/* Avatar */}
      {isCustomer ? (
        /* Incoming: contact avatar on left */
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--sand-2)',
          border: '1px solid var(--border)',
          fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
        }}>
          <User size={12} />
        </div>
      ) : isAi ? (
        /* AI: bot avatar on right with gold neon ring */
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--ink)',
          border: '1.5px solid rgba(192,155,58,0.45)',
          boxShadow: '0 0 8px rgba(192,155,58,0.25)',
        }}>
          <Bot size={12} style={{ color: 'var(--gold)' }} />
        </div>
      ) : (
        /* Human agent: avatar on right */
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--ink-mid)',
          border: '1px solid rgba(251,247,238,0.15)',
        }}>
          <User size={12} style={{ color: 'rgba(251,247,238,0.7)' }} />
        </div>
      )}

      {/* Bubble + meta */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '4px',
        alignItems: isOutgoing ? 'flex-end' : 'flex-start',
        maxWidth: '72%',
      }}>
        {isAi
          ? <div className="bubble-ai" dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
          : isCustomer
          ? <div className="bubble-customer">{msg.content}</div>
          : <div className="bubble-agent">{msg.content}</div>
        }

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {time && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.7 }}>{time}</span>
          )}
          {isAi && msg.model_used && (
            <span style={{
              fontSize: '9px', fontWeight: 600, letterSpacing: '0.3px',
              color: 'var(--gold)',
              background: 'rgba(192,155,58,0.1)',
              padding: '1px 7px', borderRadius: '99px',
              border: '1px solid rgba(192,155,58,0.25)',
            }}>
              {msg.model_used.replace('claude-', '').replace('-20251001', '')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--sand)',
      backgroundImage: [
        'linear-gradient(rgba(192,155,58,0.04) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(192,155,58,0.04) 1px, transparent 1px)',
        'linear-gradient(45deg, rgba(192,155,58,0.02) 1px, transparent 1px)',
        'linear-gradient(-45deg, rgba(192,155,58,0.02) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: '32px 32px, 32px 32px, 32px 32px, 32px 32px',
    }}>
      {/* Diamond logo */}
      <div style={{ position: 'relative', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
        <div style={{
          position: 'absolute', inset: 0, transform: 'rotate(45deg)', borderRadius: '8px',
          background: 'var(--gold)', opacity: 0.1,
        }} />
        <div style={{
          position: 'absolute', inset: '8px', transform: 'rotate(45deg)', borderRadius: '6px',
          background: 'var(--gold)', opacity: 0.18,
        }} />
        <div style={{
          position: 'absolute', inset: '16px', transform: 'rotate(45deg)', borderRadius: '4px',
          background: 'var(--gold)',
        }} />
        <span style={{ position: 'relative', zIndex: 1, color: 'var(--ink)', fontWeight: 800, fontSize: '18px' }}>A</span>
      </div>

      <p style={{
        fontSize: '16px', fontWeight: 700, color: 'var(--text)',
        fontFamily: "Georgia, 'Palatino Linotype', serif",
        marginBottom: '6px', letterSpacing: '-0.3px',
      }}>
        Selecciona una conversación
      </p>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '220px', lineHeight: 1.5 }}>
        Elige un contacto de la lista para ver y responder mensajes
      </p>
    </div>
  )
}

// ── Context menu ─────────────────────────────────────────────────────────────

function ContextMenu({ items, onClose, anchorRef }) {
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorRef])

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: '44px', right: 0,
        zIndex: 100,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(11,23,40,0.14), 0 2px 8px rgba(11,23,40,0.08)',
        minWidth: '200px',
        overflow: 'hidden',
        animation: 'menuIn 0.12s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} style={{ height: '1px', background: 'var(--border)', margin: '3px 0' }} />
        ) : (
          <button
            key={item.label}
            onClick={() => { item.action(); onClose() }}
            disabled={item.disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              width: '100%', padding: '9px 14px',
              border: 'none', background: 'transparent',
              fontSize: '12px', fontWeight: 500,
              color: item.danger ? 'var(--crimson)' : item.disabled ? 'var(--text-muted)' : 'var(--text-mid)',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!item.disabled) e.currentTarget.style.background = item.danger ? 'var(--crimson-pale)' : 'var(--sand)'
            }}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <item.icon size={14} style={{ flexShrink: 0 }} />
            <div>
              <div>{item.label}</div>
              {item.sub && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px', fontWeight: 400 }}>{item.sub}</div>}
            </div>
          </button>
        )
      )}
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(11,23,40,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}
    onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '14px', padding: '24px',
        width: '340px', maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(11,23,40,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            background: danger ? 'var(--crimson-pale)' : 'var(--gold-vp)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={16} style={{ color: danger ? 'var(--crimson)' : 'var(--gold)' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>{title}</p>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn-outline" onClick={onCancel} style={{ padding: '7px 16px' }}>Cancelar</button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px', borderRadius: '8px', border: 'none',
              background: danger ? 'var(--crimson)' : 'var(--gold)',
              color: danger ? '#fff' : 'var(--ink)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Inbox() {
  const [conversations, setConversations] = useState([])
  const [selected,      setSelected]      = useState(null)
  const [messages,      setMessages]      = useState([])
  const [filter,        setFilter]        = useState('all')
  const [search,        setSearch]        = useState('')
  const [newMsg,        setNewMsg]        = useState('')
  const [sendingMsg,    setSendingMsg]    = useState(false)
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [error,         setError]         = useState('')
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [confirm,       setConfirm]       = useState(null) // { title, message, confirmLabel, danger, onConfirm }
  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)
  const moreButtonRef  = useRef(null)

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    setError('')
    try {
      const data = USE_MOCK ? mockConversations : await getConversations()
      setConversations(data)
      if (data.length && !selected) setSelected(data[0])
    } catch {
      setError('Sin conexión — datos de prueba')
      setConversations(mockConversations)
      if (!selected) setSelected(mockConversations[0])
    } finally {
      setLoadingConvs(false)
    }
  }, [selected])

  const loadMessages = useCallback(async (conv) => {
    setLoadingMsgs(true)
    try {
      if (USE_MOCK) {
        setMessages(mockMessages.filter(m => m.conversation === conv.id))
      } else {
        const detail = await getConversation(conv.id)
        setMessages(detail.messages ?? [])
      }
    } catch {
      setMessages(mockMessages.filter(m => m.conversation === conv.id))
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    if (!selected || USE_MOCK) return
    const iv = setInterval(async () => {
      try {
        const detail = await getConversation(selected.id)
        setMessages(detail.messages ?? [])
      } catch { /* ignore */ }
    }, 5000)
    return () => clearInterval(iv)
  }, [selected?.id])

  useEffect(() => { if (selected) loadMessages(selected) }, [selected?.id])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    const text = newMsg.trim()
    if (!text || !selected || sendingMsg) return
    setSendingMsg(true)
    setNewMsg('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    try {
      const msg = await sendAgentMessage(selected.id, text)
      setMessages(ms => [...ms, msg])
    } catch {
      setNewMsg(text)
    } finally {
      setSendingMsg(false)
    }
  }

  const handleToggleAi = async (conv) => {
    try {
      const updated = await toggleAiActive(conv.id, !conv.ai_active)
      setConversations(cs => cs.map(c => c.id === updated.id ? { ...c, ai_active: updated.ai_active } : c))
      if (selected?.id === updated.id) setSelected(s => ({ ...s, ai_active: updated.ai_active }))
    } catch { /* ignore */ }
  }

  const updateStatus = async (conv, newStatus) => {
    if (USE_MOCK) {
      setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, status: newStatus } : c))
      setSelected(s => s?.id === conv.id ? { ...s, status: newStatus } : s)
      return
    }
    try {
      const { data } = await api.patch(`/conversations/${conv.id}/update/`, { status: newStatus })
      setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, status: data.status ?? newStatus } : c))
      setSelected(s => s?.id === conv.id ? { ...s, status: data.status ?? newStatus } : s)
    } catch { /* ignore */ }
  }

  const handleConvAction = (action) => {
    if (!selected) return
    const conv = selected

    const actions = {
      resolve: () => setConfirm({
        title: 'Marcar como resuelta',
        message: `La conversación con ${conv.contact?.name ?? 'este contacto'} se marcará como resuelta y quedará inactiva.`,
        confirmLabel: 'Resolver',
        danger: false,
        onConfirm: () => { updateStatus(conv, 'blocked'); setConfirm(null) },
      }),
      reopen: () => updateStatus(conv, 'active'),
      human: () => updateStatus(conv, 'human_takeover'),
      block: () => setConfirm({
        title: 'Bloquear contacto',
        message: `${conv.contact?.name ?? 'Este contacto'} no podrá enviar más mensajes. Podrás desbloquearlo después.`,
        confirmLabel: 'Bloquear',
        danger: true,
        onConfirm: () => { updateStatus(conv, 'blocked'); setConfirm(null) },
      }),
      unblock: () => updateStatus(conv, 'active'),
      export: () => {
        const lines = messages.map(m =>
          `[${m.created_at ?? ''}] ${m.role === 'customer' ? conv.contact?.name ?? 'Cliente' : m.role === 'ai' ? 'IA' : 'Agente'}: ${m.content}`
        )
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `conv-${conv.id}-${(conv.contact?.name ?? 'contacto').replace(/\s+/g, '_')}.txt`
        a.click()
        URL.revokeObjectURL(a.href)
      },
    }

    actions[action]?.()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e) => {
    setNewMsg(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const FILTERS = [
    { key: 'all',           label: 'Todos' },
    { key: 'active',        label: 'Activos' },
    { key: 'human_takeover', label: 'Humano' },
  ]

  const filtered = conversations
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c => {
      if (!search) return true
      const name = (c.contact?.name ?? c.contact_name ?? '').toLowerCase()
      return name.includes(search.toLowerCase())
    })

  const selName        = selected?.contact?.name ?? selected?.contact_name ?? ''
  const selChannelType = selected?.channel?.type ?? selected?.channel_type ?? 'whatsapp'
  const selPhone       = selected?.contact?.phone ?? ''
  const aiActive       = selected?.ai_active ?? false

  // Group messages with date separators
  const messageGroups = []
  let lastDate = null
  for (const msg of messages) {
    const d = msg.created_at ? new Date(msg.created_at).toDateString() : null
    if (d && d !== lastDate) {
      messageGroups.push({ type: 'date', label: formatDate(msg.created_at), key: `date-${d}` })
      lastDate = d
    }
    messageGroups.push({ type: 'msg', msg, key: msg.id })
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* ── LEFT PANEL: Conversation list ──────────────────────────── */}
      <div style={{
        width: '300px', flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>

        {/* Panel header */}
        <div style={{
          padding: '16px 16px 0',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h2 style={{
                margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)',
                fontFamily: "Georgia, 'Palatino Linotype', serif",
                letterSpacing: '-0.2px',
              }}>
                Conversaciones
              </h2>
              {!loadingConvs && (
                <p style={{ margin: '1px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
                </p>
              )}
            </div>
            <button
              onClick={loadConversations}
              style={{
                width: '30px', height: '30px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--sand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text-muted)', transition: 'background 0.12s',
              }}
              title="Actualizar"
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--gold-vp)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--sand)')}
            >
              <RefreshCw size={12} style={loadingConvs ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={13} style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)',
              pointerEvents: 'none',
            }} />
            <input
              className="inbox-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contacto…"
            />
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '4px', paddingBottom: '12px' }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`filter-pill ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            margin: '8px 12px 0',
            padding: '7px 10px',
            background: 'var(--gold-vp)',
            border: '1px solid rgba(192,155,58,0.3)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--text-mid)',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ color: 'var(--gold)', fontSize: '13px' }}>⚠</span>
            {error}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px' }}>
              <Loader size={16} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin conversaciones</p>
            </div>
          ) : (
            filtered.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                active={selected?.id === conv.id}
                onClick={() => setSelected(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat ──────────────────────────────────────── */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>

          {/* Chat header */}
          <div style={{
            background: 'var(--surface)',
            borderBottom: '1px solid rgba(192,155,58,0.2)',
            boxShadow: '0 1px 12px rgba(192,155,58,0.06)',
            padding: '0 20px',
            height: '64px',
            display: 'flex', alignItems: 'center', gap: '14px',
            flexShrink: 0,
          }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={avatarStyle(selName, 40)}>{initials(selName)}</div>
              <span style={{
                position: 'absolute', bottom: '1px', right: '1px',
                width: '11px', height: '11px', borderRadius: '50%',
                background: aiActive ? 'var(--gold)' : '#D97706',
                border: '2px solid var(--surface)',
                boxShadow: aiActive ? '0 0 8px rgba(192,155,58,0.6)' : '0 0 6px rgba(217,119,6,0.5)',
              }} />
            </div>

            {/* Contact info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)',
                fontFamily: "Georgia, 'Palatino Linotype', serif",
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {selName || '—'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                <ChannelPill type={selChannelType} />
                <StatusPill status={selected.status} />
                {selPhone && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Phone size={9} />
                    {selPhone}
                  </span>
                )}
              </div>
            </div>

            {/* AI Toggle section */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '7px 14px',
              background: aiActive ? 'var(--gold-vp)' : 'var(--sand)',
              border: `1px solid ${aiActive ? 'rgba(192,155,58,0.3)' : 'var(--border)'}`,
              borderRadius: '10px',
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {aiActive
                  ? <Sparkles size={13} style={{ color: 'var(--gold)' }} />
                  : <User size={13} style={{ color: 'var(--text-muted)' }} />
                }
                <span style={{
                  fontSize: '11px', fontWeight: 600,
                  color: aiActive ? 'var(--text-mid)' : 'var(--text-muted)',
                  letterSpacing: '0.1px',
                }}>
                  {aiActive ? 'IA activa' : 'Modo humano'}
                </span>
              </div>
              <AiToggle active={aiActive} onToggle={() => handleToggleAi(selected)} />
            </div>

            {/* More button + dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                ref={moreButtonRef}
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: `1px solid ${menuOpen ? 'var(--gold)' : 'var(--border)'}`,
                  background: menuOpen ? 'var(--gold-vp)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  color: menuOpen ? 'var(--gold)' : 'var(--text-muted)',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!menuOpen) e.currentTarget.style.background = 'var(--sand)' }}
                onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent' }}
              >
                <MoreVertical size={15} />
              </button>

              {menuOpen && (
                <ContextMenu
                  anchorRef={moreButtonRef}
                  onClose={() => setMenuOpen(false)}
                  items={[
                    selected?.status !== 'blocked' ? {
                      icon: CheckCircle,
                      label: 'Marcar como resuelta',
                      sub: 'Cierra la conversación',
                      action: () => handleConvAction('resolve'),
                    } : {
                      icon: CheckCircle,
                      label: 'Reabrir conversación',
                      sub: 'Vuelve a estado activo',
                      action: () => handleConvAction('reopen'),
                    },
                    selected?.status !== 'human_takeover' ? {
                      icon: User,
                      label: 'Pasar a agente humano',
                      sub: 'Desactiva la IA para esta conv.',
                      action: () => handleConvAction('human'),
                      disabled: selected?.status === 'human_takeover',
                    } : {
                      icon: Bot,
                      label: 'Devolver a IA',
                      sub: 'Reactiva el agente automático',
                      action: () => handleConvAction('reopen'),
                    },
                    {
                      icon: Download,
                      label: 'Exportar conversación',
                      sub: 'Descarga como .txt',
                      action: () => handleConvAction('export'),
                      disabled: messages.length === 0,
                    },
                    'divider',
                    selected?.status !== 'blocked' ? {
                      icon: Ban,
                      label: 'Bloquear contacto',
                      sub: 'No podrá enviar mensajes',
                      action: () => handleConvAction('block'),
                      danger: true,
                    } : {
                      icon: UserX,
                      label: 'Desbloquear contacto',
                      sub: 'Reactivar comunicación',
                      action: () => handleConvAction('unblock'),
                    },
                  ]}
                />
              )}
            </div>
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '20px 24px',
            background: 'var(--sand-2)',
            backgroundImage: [
              'radial-gradient(ellipse 60% 35% at 20% 10%, rgba(192,155,58,0.05) 0%, transparent 70%)',
              'radial-gradient(ellipse 50% 40% at 85% 90%, rgba(26,92,58,0.03) 0%, transparent 65%)',
            ].join(', '),
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>
            {loadingMsgs ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Loader size={18} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : messageGroups.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                <Bot size={24} style={{ color: 'var(--border)' }} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin mensajes aún</p>
              </div>
            ) : (
              messageGroups.map(g =>
                g.type === 'date'
                  ? <DateDivider key={g.key} label={g.label} />
                  : <MessageBubble key={g.key} msg={g.msg} />
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose bar */}
          <div style={{
            background: 'var(--surface)',
            borderTop: '1px solid rgba(192,155,58,0.15)',
            boxShadow: '0 -4px 20px rgba(192,155,58,0.05)',
            padding: '12px 20px',
            flexShrink: 0,
          }}>
            {/* AI status chip above input */}
            {aiActive && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                marginBottom: '8px',
                fontSize: '10px', color: 'var(--text-muted)',
              }}>
                <Sparkles size={9} style={{ color: 'var(--gold)' }} />
                <span>El agente IA responderá automáticamente — este mensaje se enviará como <strong style={{ color: 'var(--text-mid)' }}>agente humano</strong></span>
              </div>
            )}

            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: '10px',
              padding: '10px 14px',
              background: 'var(--sand)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              transition: 'border-color 0.15s',
            }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
            onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <textarea
                ref={textareaRef}
                className="compose-input"
                rows={1}
                value={newMsg}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje… (Enter para enviar)"
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!newMsg.trim() || sendingMsg}
              >
                {sendingMsg
                  ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Send size={14} style={{ marginLeft: '1px' }} />
                }
              </button>
            </div>

            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px', opacity: 0.7, textAlign: 'right' }}>
              Enter · enviar &nbsp;·&nbsp; Shift+Enter · nueva línea
            </p>
          </div>
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
