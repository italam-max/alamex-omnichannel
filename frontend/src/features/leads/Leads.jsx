import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import {
  MessageSquare, CheckCircle, Clock, AlertTriangle,
  RefreshCw, User, Bot, Loader, Ban, ExternalLink,
  Circle, Zap, Activity,
} from 'lucide-react'
import { mockConversations } from '../../mocks/conversations'
import api from '../../services/api'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  { id: 1, name: 'Ana García',    initials: 'AG', status: 'online', active: 2, color: 'var(--jade)' },
  { id: 2, name: 'Carlos Ruiz',   initials: 'CR', status: 'busy',   active: 4, color: 'var(--gold)' },
  { id: 3, name: 'María López',   initials: 'ML', status: 'away',   active: 0, color: 'var(--text-muted)' },
  { id: 4, name: 'Pedro Ruiz',    initials: 'PR', status: 'online', active: 1, color: 'var(--jade)' },
]

const MOCK_FOLLOWUPS = [
  {
    id: 1,
    reason: 'Cliente solicitó cotización formal para elevador AX-800, 8 pisos uso comercial. Enviar propuesta.',
    priority: 'high',
    status: 'open',
    created_at: '2026-06-24T12:30:00Z',
    conversation: {
      id: 1,
      contact: { name: 'Carlos Mendoza', phone: '+52 55 1234 5678' },
      channel: { type: 'whatsapp' },
      status: 'human_takeover',
      updated_at: '2026-06-24T12:30:00Z',
    },
  },
  {
    id: 2,
    reason: 'Solicitud de 3 elevadores industriales para planta en Monterrey. Requiere visita técnica.',
    priority: 'high',
    status: 'open',
    created_at: '2026-06-24T11:15:00Z',
    conversation: {
      id: 2,
      contact: { name: 'Sofía Ramírez', phone: '+52 33 9876 5432' },
      channel: { type: 'instagram' },
      status: 'human_takeover',
      updated_at: '2026-06-24T11:15:00Z',
    },
  },
  {
    id: 3,
    reason: 'Interés en mantenimiento anual para 2 elevadores residenciales. Agendar llamada.',
    priority: 'medium',
    status: 'in_progress',
    created_at: '2026-06-24T09:00:00Z',
    conversation: {
      id: 4,
      contact: { name: 'Laura Vega', phone: '+52 55 2233 4455' },
      channel: { type: 'whatsapp' },
      status: 'active',
      updated_at: '2026-06-24T10:00:00Z',
    },
  },
  {
    id: 4,
    reason: 'Preguntó por financiamiento disponible. Referir al departamento de crédito.',
    priority: 'low',
    status: 'open',
    created_at: '2026-06-23T16:00:00Z',
    conversation: {
      id: 3,
      contact: { name: 'Miguel Torres', phone: '+52 81 5555 0000' },
      channel: { type: 'messenger' },
      status: 'active',
      updated_at: '2026-06-23T17:00:00Z',
    },
  },
]

const MOCK_HUMAN = mockConversations.filter(c => c.status === 'human_takeover').map(c => ({
  ...c,
  waitSince: c.updated_at,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitMinutes(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

function formatWait(min) {
  if (min < 1)  return 'Ahora'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function slaColor(min, limit = 15) {
  const pct = min / limit
  if (pct < 0.4) return 'var(--jade)'
  if (pct < 0.7) return 'var(--gold)'
  if (pct < 1)   return '#D97706'
  return 'var(--crimson)'
}

const PRIORITY_CFG = {
  high:   { label: 'Alta',  bg: 'var(--crimson-pale)', text: 'var(--crimson)', border: 'rgba(122,28,42,0.2)', dot: 'var(--crimson)' },
  medium: { label: 'Media', bg: 'var(--gold-vp)',       text: 'var(--text-mid)', border: 'rgba(192,155,58,0.25)', dot: 'var(--gold)' },
  low:    { label: 'Baja',  bg: 'var(--jade-pale)',     text: 'var(--jade)',    border: 'rgba(26,92,58,0.2)', dot: 'var(--jade)' },
}

const CHANNEL_CFG = {
  whatsapp:  { label: 'WhatsApp', dot: '#25D366' },
  instagram: { label: 'Instagram', dot: '#E1306C' },
  messenger: { label: 'Messenger', dot: '#0084FF' },
  website:   { label: 'Web', dot: 'var(--gold)' },
}

const AGENT_STATUS = {
  online: { dot: 'var(--jade)',       glow: 'rgba(26,92,58,0.5)',   label: 'En línea' },
  busy:   { dot: 'var(--gold)',       glow: 'rgba(192,155,58,0.5)', label: 'Ocupado' },
  away:   { dot: 'var(--text-muted)', glow: 'none',                 label: 'Ausente' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  const c = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 8px', borderRadius: '99px',
      background: c.bg, color: c.text,
      border: `1px solid ${c.border}`,
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.2px',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: c.dot, boxShadow: `0 0 4px ${c.dot}80` }} />
      {c.label}
    </span>
  )
}

function ChannelDot({ type }) {
  const c = CHANNEL_CFG[type] ?? CHANNEL_CFG.whatsapp
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.dot, boxShadow: `0 0 4px ${c.dot}66`, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}

function SlaBar({ waitMin, limit = 15 }) {
  const pct   = Math.min(100, (waitMin / limit) * 100)
  const color = slaColor(waitMin, limit)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          SLA {limit}min
        </span>
        <span style={{ fontSize: '9px', fontWeight: 700, color }}>
          {formatWait(waitMin)}
        </span>
      </div>
      <div style={{ height: '4px', background: 'var(--sand-2)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: '99px',
          background: color,
          boxShadow: pct >= 70 ? `0 0 6px ${color}80` : 'none',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

function FollowUpCard({ item, onGoto, onClose }) {
  const conv    = item.conversation
  const contact = conv?.contact
  const channel = conv?.channel?.type ?? 'whatsapp'
  const p       = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium
  const ago     = waitMinutes(item.created_at)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 1px 4px rgba(11,23,40,0.05)',
      borderLeft: `3px solid ${p.dot}`,
      transition: 'box-shadow 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(11,23,40,0.1)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(11,23,40,0.05)')}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
            background: 'var(--gold-pale)', border: '1.5px solid rgba(192,155,58,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: 'var(--gold)',
          }}>
            {contact?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) ?? '?'}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              {contact?.name ?? 'Sin nombre'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <ChannelDot type={channel} />
              {contact?.phone && (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{contact.phone}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <PriorityBadge priority={item.priority} />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            <Clock size={9} style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />
            hace {formatWait(ago)}
          </span>
        </div>
      </div>

      {/* Reason */}
      <div style={{
        padding: '9px 12px',
        background: 'var(--sand)',
        borderRadius: '8px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', gap: '7px' }}>
          <Zap size={11} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-mid)', lineHeight: 1.55 }}>
            {item.reason}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '7px' }}>
        <button onClick={() => onGoto(item)} className="btn-gold" style={{ padding: '6px 14px', fontSize: '11px' }}>
          <ExternalLink size={11} /> Ver conversación
        </button>
        {item.status !== 'done' && (
          <button onClick={() => onClose(item)} className="btn-outline" style={{ padding: '6px 14px', fontSize: '11px' }}>
            <CheckCircle size={11} /> Cerrar
          </button>
        )}
      </div>
    </div>
  )
}

function HumanWaitCard({ conv, onGoto, onResolve }) {
  const name    = conv.contact?.name ?? conv.contact_name ?? 'Sin nombre'
  const channel = conv.channel?.type ?? conv.channel_type ?? 'whatsapp'
  const waitMin = waitMinutes(conv.updated_at ?? conv.created_at)
  const urgent  = waitMin >= 10

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${urgent ? 'rgba(122,28,42,0.25)' : 'var(--border)'}`,
      borderRadius: '12px',
      padding: '14px 16px',
      boxShadow: urgent
        ? '0 2px 12px rgba(122,28,42,0.08), 0 0 0 1px rgba(122,28,42,0.08)'
        : '0 1px 4px rgba(11,23,40,0.05)',
      borderLeft: `3px solid ${urgent ? 'var(--crimson)' : 'var(--gold)'}`,
      transition: 'box-shadow 0.15s',
    }}>
      {/* Contact row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: urgent ? 'var(--crimson-pale)' : 'var(--gold-pale)',
              border: `1.5px solid ${urgent ? 'rgba(122,28,42,0.3)' : 'rgba(192,155,58,0.3)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700,
              color: urgent ? 'var(--crimson)' : 'var(--gold)',
            }}>
              {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            {urgent && (
              <span style={{
                position: 'absolute', top: '-2px', right: '-2px',
                width: '10px', height: '10px', borderRadius: '50%',
                background: 'var(--crimson)',
                boxShadow: '0 0 6px rgba(122,28,42,0.6)',
                border: '1.5px solid var(--surface)',
              }} />
            )}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{name}</p>
            <ChannelDot type={channel} />
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 9px', borderRadius: '99px',
            background: urgent ? 'var(--crimson-pale)' : 'var(--gold-vp)',
            color: urgent ? 'var(--crimson)' : 'var(--text-mid)',
            fontSize: '11px', fontWeight: 700,
            border: `1px solid ${urgent ? 'rgba(122,28,42,0.2)' : 'rgba(192,155,58,0.2)'}`,
          }}>
            {urgent && <AlertTriangle size={10} />}
            {formatWait(waitMin)}
          </span>
        </div>
      </div>

      {/* Last message */}
      {conv.last_message && (
        <p style={{
          margin: '0 0 10px',
          fontSize: '11px', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontStyle: 'italic',
        }}>
          "{conv.last_message}"
        </p>
      )}

      {/* SLA bar */}
      <div style={{ marginBottom: '12px' }}>
        <SlaBar waitMin={waitMin} limit={15} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '7px' }}>
        <button onClick={() => onGoto(conv)} className="btn-gold" style={{ padding: '6px 14px', fontSize: '11px' }}>
          <MessageSquare size={11} /> Atender
        </button>
        <button onClick={() => onResolve(conv)} className="btn-outline" style={{ padding: '6px 14px', fontSize: '11px' }}>
          <CheckCircle size={11} /> Cerrar
        </button>
      </div>
    </div>
  )
}

function AgentCard({ agent }) {
  const st = AGENT_STATUS[agent.status] ?? AGENT_STATUS.away
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--sand-2)',
          border: `1.5px solid ${agent.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 700, color: agent.color,
        }}>
          {agent.initials}
        </div>
        <span style={{
          position: 'absolute', bottom: '0px', right: '0px',
          width: '9px', height: '9px', borderRadius: '50%',
          background: st.dot,
          border: '1.5px solid var(--surface)',
          boxShadow: agent.status !== 'away' ? `0 0 5px ${st.glow}` : 'none',
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.name}
        </p>
        <p style={{ margin: '1px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
          {st.label} · {agent.active} {agent.active === 1 ? 'conv.' : 'convs.'}
        </p>
      </div>
      {agent.status === 'online' && (
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: 'var(--jade)',
          boxShadow: '0 0 6px rgba(26,92,58,0.5)',
          flexShrink: 0,
        }} />
      )}
    </div>
  )
}

function EmptyTab({ icon: Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px' }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '14px',
        background: 'var(--gold-vp)', border: '1px solid rgba(192,155,58,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} style={{ color: 'var(--gold)' }} />
      </div>
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>{title}</p>
      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '220px', lineHeight: 1.5 }}>{sub}</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'followups', label: 'Seguimientos IA', icon: Zap },
  { key: 'human',     label: 'Atención humana', icon: User },
  { key: 'closed',    label: 'Cerrados',        icon: CheckCircle },
]

export default function Leads() {
  const navigate = useNavigate()
  const [tab,       setTab]       = useState('followups')
  const [followups, setFollowups] = useState([])
  const [humanConvs, setHumanConvs] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [, setTick] = useState(0)  // force re-render for live timers

  // re-render every 30s to update wait times
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(iv)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK) {
        setFollowups(MOCK_FOLLOWUPS)
        setHumanConvs(MOCK_HUMAN)
      } else {
        const [fuRes, huRes] = await Promise.all([
          api.get('/contacts/followups/?status=open&status=in_progress').catch(() => ({ data: [] })),
          api.get('/conversations/?status=human_takeover').catch(() => ({ data: [] })),
        ])
        setFollowups(fuRes.data.results ?? fuRes.data)
        setHumanConvs(huRes.data.results ?? huRes.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleGotoConv = (item) => {
    navigate('/inbox')
  }

  const handleCloseFollowup = (item) => {
    setFollowups(fs => fs.filter(f => f.id !== item.id))
  }

  const handleResolveConv = async (conv) => {
    try {
      if (!USE_MOCK) await api.patch(`/conversations/${conv.id}/update/`, { status: 'blocked' })
      setHumanConvs(cs => cs.filter(c => c.id !== conv.id))
    } catch { /* ignore */ }
  }

  const openFollowups  = followups.filter(f => f.status === 'open')
  const inProgFollowups = followups.filter(f => f.status === 'in_progress')
  const allOpen        = [...openFollowups, ...inProgFollowups]
  const urgentHuman    = humanConvs.filter(c => waitMinutes(c.updated_at ?? c.created_at) >= 10)
  const normalHuman    = humanConvs.filter(c => waitMinutes(c.updated_at ?? c.created_at) < 10)

  const tabCounts = {
    followups: allOpen.length,
    human:     humanConvs.length,
    closed:    0,
  }

  return (
    <PageShell
      title="Seguimientos"
      subtitle="Flujo de atención, seguimientos pendientes y agentes"
    >
      <div style={{ display: 'flex', gap: '20px', height: '100%', minHeight: 0 }}>

        {/* ── Main panel ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Tabs + refresh */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '6px',
          }}>
            <div style={{ display: 'flex', gap: '2px' }}>
              {TABS.map(t => {
                const active = tab === t.key
                const count  = tabCounts[t.key]
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 14px', borderRadius: '8px', border: 'none',
                      background: active ? 'var(--ink)' : 'transparent',
                      color: active ? 'var(--gold)' : 'var(--text-muted)',
                      fontSize: '12px', fontWeight: active ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.12s',
                      letterSpacing: '0.1px',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sand)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <t.icon size={13} />
                    {t.label}
                    {count > 0 && (
                      <span style={{
                        background: active
                          ? 'rgba(192,155,58,0.25)'
                          : t.key === 'human' && urgentHuman.length > 0 ? 'var(--crimson)' : 'var(--sand-2)',
                        color: active ? 'var(--gold)' : t.key === 'human' && urgentHuman.length > 0 ? '#fff' : 'var(--text-muted)',
                        fontSize: '9px', fontWeight: 700,
                        padding: '1px 6px', borderRadius: '99px',
                        boxShadow: t.key === 'human' && urgentHuman.length > 0 ? '0 0 5px rgba(122,28,42,0.4)' : 'none',
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={load}
              className="btn-outline"
              style={{ padding: '6px 10px', fontSize: '11px' }}
              title="Actualizar"
            >
              <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
              <Loader size={20} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : tab === 'followups' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {allOpen.length === 0 ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <EmptyTab icon={Zap} title="Sin seguimientos pendientes" sub="El agente IA creará seguimientos automáticamente cuando detecte oportunidades o tareas." />
                </div>
              ) : (
                allOpen.map(f => (
                  <FollowUpCard
                    key={f.id}
                    item={f}
                    onGoto={handleGotoConv}
                    onClose={handleCloseFollowup}
                  />
                ))
              )}
            </div>
          ) : tab === 'human' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {humanConvs.length === 0 ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <EmptyTab icon={User} title="Sin conversaciones esperando" sub="Cuando una conversación se pase a atención humana aparecerá aquí con su SLA." />
                </div>
              ) : (
                <>
                  {urgentHuman.length > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                      background: 'var(--crimson-pale)', border: '1px solid rgba(122,28,42,0.2)',
                      borderRadius: '8px',
                    }}>
                      <AlertTriangle size={13} style={{ color: 'var(--crimson)', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: 'var(--crimson)', fontWeight: 600 }}>
                        {urgentHuman.length} {urgentHuman.length === 1 ? 'conversación lleva' : 'conversaciones llevan'} más de 10 min sin respuesta
                      </span>
                    </div>
                  )}
                  {[...urgentHuman, ...normalHuman].map(c => (
                    <HumanWaitCard
                      key={c.id}
                      conv={c}
                      onGoto={handleGotoConv}
                      onResolve={handleResolveConv}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <EmptyTab icon={CheckCircle} title="Sin registros cerrados hoy" sub="Los seguimientos y conversaciones cerrados aparecerán aquí." />
            </div>
          )}
        </div>

        {/* ── Right panel: Agents + Stats ─────────────────────────── */}
        <div style={{ width: '256px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Stats */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px',
            boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
          }}>
            <p style={{
              margin: '0 0 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text)',
              textTransform: 'uppercase', letterSpacing: '1px',
            }}>
              Resumen
            </p>
            {[
              { label: 'Esperando humano', value: humanConvs.length, color: humanConvs.length > 0 ? 'var(--gold)' : 'var(--jade)', glow: humanConvs.length > 0 },
              { label: 'Sin respuesta >10min', value: urgentHuman.length, color: urgentHuman.length > 0 ? 'var(--crimson)' : 'var(--jade)', glow: urgentHuman.length > 0 },
              { label: 'Seguimientos abiertos', value: allOpen.length, color: 'var(--gold)', glow: false },
            ].map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: '1px solid var(--sand)',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{
                  fontSize: '14px', fontWeight: 800, color: s.color,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: s.glow && s.value > 0 ? `0 0 8px ${s.color}60` : 'none',
                }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>

          {/* Agents */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px',
            boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Agentes
              </p>
              <span style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '10px', color: 'var(--jade)', fontWeight: 600,
              }}>
                <Activity size={10} />
                {MOCK_AGENTS.filter(a => a.status === 'online').length} en línea
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {MOCK_AGENTS.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
            <p style={{
              margin: '12px 0 0', fontSize: '10px', color: 'var(--text-muted)',
              lineHeight: 1.4, textAlign: 'center',
            }}>
              La asignación de agentes requiere el módulo de equipos. Próximamente.
            </p>
          </div>

          {/* IA note */}
          <div className="agent-note" style={{ marginBottom: 0 }}>
            <Bot size={13} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }} />
            <span style={{ fontSize: '11px', lineHeight: 1.5 }}>
              Los seguimientos son creados automáticamente por el agente IA cuando detecta oportunidades o necesidades de atención.
            </span>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
