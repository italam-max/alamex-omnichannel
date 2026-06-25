import { useState, useEffect, useCallback, useRef } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Inbox as InboxIcon, Zap, Send, CheckCircle, Bot, Loader,
  AlertTriangle, MessageSquare, CornerUpLeft, Hand,
} from 'lucide-react'
import {
  getMyConversations, getQueue, claimConversation, releaseConversation,
  closeConversation, sendAgentMessage, getConversation,
  getMyFollowups, setFollowupStatus,
} from '../../services/conversations'
import { getMe, getWorkspace, setAvailability } from '../../services/accounts'

// ── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_SLA = { warning: 5, critical: 10, escalate: 15 }

function waitMinutes(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}
function fmtWait(m) {
  if (m < 1)  return 'ahora'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}
function tierColor(min, sla) {
  if (min >= sla.escalate) return 'var(--crimson)'
  if (min >= sla.critical) return 'var(--crimson)'
  if (min >= sla.warning)  return '#D97706'
  return 'var(--jade)'
}

const CHANNEL_CFG = {
  whatsapp:  { label: 'WhatsApp',  dot: '#25D366' },
  instagram: { label: 'Instagram', dot: '#E1306C' },
  messenger: { label: 'Messenger', dot: '#0084FF' },
  website:   { label: 'Web',       dot: 'var(--gold)' },
}

const AVAIL_CFG = {
  online: { label: 'En línea', dot: 'var(--jade)',       glow: 'rgba(26,92,58,0.5)' },
  busy:   { label: 'Ocupado',  dot: 'var(--gold)',       glow: 'rgba(192,155,58,0.5)' },
  away:   { label: 'Ausente',  dot: 'var(--text-muted)', glow: 'none' },
}

function ChannelDot({ type }) {
  const c = CHANNEL_CFG[type] ?? CHANNEL_CFG.website
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}

// ── Availability switch ─────────────────────────────────────────────

function AvailabilitySwitch({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--sand)', borderRadius: '99px', padding: '3px', gap: '2px', border: '1px solid var(--border)' }}>
      {Object.entries(AVAIL_CFG).map(([key, c]) => {
        const on = value === key
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 12px', borderRadius: '99px', border: 'none', cursor: 'pointer',
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '11px', fontWeight: on ? 700 : 500,
              boxShadow: on ? '0 1px 3px rgba(11,23,40,0.1)' : 'none',
              transition: 'all 0.12s',
            }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.dot, boxShadow: on && c.glow !== 'none' ? `0 0 5px ${c.glow}` : 'none' }} />
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Conversation list item ──────────────────────────────────────────

function ConvItem({ conv, active, sla, onClick, onClaim }) {
  const name = conv.contact?.name ?? 'Contacto'
  const channel = conv.channel?.type ?? 'website'
  const last = conv.messages?.[conv.messages.length - 1]
  const lastCustomer = [...(conv.messages ?? [])].reverse().find(m => m.role === 'customer')
  const waiting = last?.role === 'customer'
  const wait = waiting ? waitMinutes(lastCustomer?.created_at ?? conv.updated_at) : 0
  const wc = tierColor(wait, sla)

  return (
    <div onClick={onClick}
      style={{
        padding: '12px 14px', cursor: 'pointer',
        borderRadius: '10px',
        background: active ? 'var(--gold-vp)' : 'transparent',
        border: `1px solid ${active ? 'rgba(192,155,58,0.3)' : 'transparent'}`,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sand)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--sand-2)', border: '1.5px solid var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: 'var(--gold)',
        }}>
          {initials(name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            {waiting && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: wc, flexShrink: 0 }}>
                {wait >= sla.critical && <AlertTriangle size={9} />}
                {fmtWait(wait)}
              </span>
            )}
          </div>
          <div style={{ marginTop: '2px' }}><ChannelDot type={channel} /></div>
          {last && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {last.role === 'customer' ? '' : last.role === 'ai' ? 'IA: ' : 'Tú: '}{last.content}
            </p>
          )}
          {onClaim && (
            <button onClick={e => { e.stopPropagation(); onClaim(conv) }}
              style={{
                marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'var(--jade)', color: '#fff', fontSize: '11px', fontWeight: 700,
                boxShadow: '0 0 10px rgba(26,92,58,0.25)',
              }}>
              <Hand size={11} /> Tomar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ──────────────────────────────────────────────────

function Bubble({ msg }) {
  const isCustomer = msg.role === 'customer'
  const isAi = msg.role === 'ai'
  return (
    <div style={{ display: 'flex', flexDirection: isCustomer ? 'row' : 'row-reverse', marginBottom: '10px' }}>
      <div style={{
        maxWidth: '74%', padding: '9px 13px', borderRadius: '14px',
        fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        background: isCustomer ? 'var(--surface)' : isAi ? 'var(--gold-vp)' : 'var(--ink)',
        color: isCustomer ? 'var(--text)' : isAi ? 'var(--text)' : 'var(--gold-vp)',
        border: isCustomer ? '1px solid var(--border)' : isAi ? '1px solid rgba(192,155,58,0.25)' : 'none',
        borderBottomLeftRadius: isCustomer ? '4px' : '14px',
        borderBottomRightRadius: isCustomer ? '14px' : '4px',
        boxShadow: isAi ? '0 0 0 1px rgba(192,155,58,0.18), 0 0 14px rgba(192,155,58,0.07)' : '0 1px 2px rgba(11,23,40,0.05)',
      }}>
        {isAi && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: 700, color: 'var(--gold)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Bot size={9} /> IA
          </span>
        )}
        <div>{msg.content}</div>
      </div>
    </div>
  )
}

// ── Follow-up card (compact) ────────────────────────────────────────

function MyFollowupCard({ item, onDone }) {
  const PRI = { high: 'var(--crimson)', medium: 'var(--gold)', low: 'var(--jade)' }
  const c = PRI[item.priority] ?? 'var(--gold)'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', borderLeft: `3px solid ${c}` }}>
      <div style={{ display: 'flex', gap: '7px', marginBottom: '10px' }}>
        <Zap size={12} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '2px' }} />
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-mid)', lineHeight: 1.5 }}>{item.reason}</p>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => onDone(item)} className="btn-gold" style={{ padding: '5px 12px', fontSize: '11px' }}>
          <CheckCircle size={11} /> Marcar hecho
        </button>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────

const TABS = [
  { key: 'mine',  label: 'Asignadas',    icon: MessageSquare },
  { key: 'queue', label: 'Disponibles',  icon: InboxIcon },
  { key: 'fu',    label: 'Seguimientos', icon: Zap },
]

export default function AgentWorkspace() {
  const [me, setMe]             = useState(null)
  const [sla, setSla]           = useState(DEFAULT_SLA)
  const [tab, setTab]           = useState('mine')
  const [mine, setMine]         = useState([])
  const [queue, setQueue]       = useState([])
  const [followups, setFollowups] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const endRef = useRef(null)

  const load = useCallback(async () => {
    const [meData, ws, myConvs, q, fu] = await Promise.all([
      getMe().catch(() => null),
      getWorkspace().catch(() => null),
      getMyConversations().catch(() => []),
      getQueue().catch(() => []),
      getMyFollowups().catch(() => []),
    ])
    setMe(meData)
    if (ws) setSla({ warning: ws.sla_warning_minutes, critical: ws.sla_critical_minutes, escalate: ws.sla_escalate_minutes })
    setMine(myConvs); setQueue(q); setFollowups(fu)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // Refresh lists + selected thread every 20s
  useEffect(() => {
    const iv = setInterval(async () => {
      const [myConvs, q] = await Promise.all([getMyConversations().catch(() => null), getQueue().catch(() => null)])
      if (myConvs) setMine(myConvs)
      if (q) setQueue(q)
      if (selected) { const fresh = await getConversation(selected.id).catch(() => null); if (fresh) setSelected(fresh) }
    }, 20_000)
    return () => clearInterval(iv)
  }, [selected])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [selected?.messages?.length])

  const refreshSelected = async (id) => {
    const fresh = await getConversation(id).catch(() => null)
    if (fresh) setSelected(fresh)
  }

  const handleAvailability = async (value) => {
    setMe(m => ({ ...m, availability: value }))
    if (me?.id) await setAvailability(me.id, value).catch(() => {})
  }

  const handleClaim = async (conv) => {
    await claimConversation(conv.id).catch(() => {})
    await load()
    const fresh = await getConversation(conv.id).catch(() => null)
    if (fresh) { setSelected(fresh); setTab('mine') }
  }

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !selected) return
    setSending(true)
    try {
      await sendAgentMessage(selected.id, text)
      setDraft('')
      await refreshSelected(selected.id)
    } finally { setSending(false) }
  }

  const handleRelease = async () => {
    if (!selected) return
    await releaseConversation(selected.id).catch(() => {})
    setSelected(null); await load()
  }

  const handleClose = async () => {
    if (!selected) return
    await closeConversation(selected.id).catch(() => {})
    setSelected(null); await load()
  }

  const handleFollowupDone = async (item) => {
    await setFollowupStatus(item.id, 'done').catch(() => {})
    setFollowups(fs => fs.filter(f => f.id !== item.id))
  }

  const list = tab === 'mine' ? mine : tab === 'queue' ? queue : []
  const counts = { mine: mine.length, queue: queue.length, fu: followups.length }
  const avail = me?.availability ?? 'away'

  return (
    <PageShell title="Mi Bandeja" subtitle="Tus conversaciones asignadas y seguimientos">
      {/* Availability bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontSize: '13px', fontWeight: 700 }}>
            {initials(me?.name)}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{me?.name ?? 'Agente'}</p>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{me?.role === 'admin' ? 'Administrador' : me?.role === 'supervisor' ? 'Supervisor' : 'Agente'}</p>
          </div>
        </div>
        <AvailabilitySwitch value={avail} onChange={handleAvailability} />
      </div>

      <div style={{ display: 'flex', gap: '16px', height: 'calc(100% - 64px)', minHeight: 0 }}>
        {/* Left: list */}
        <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', padding: '6px', gap: '2px', borderBottom: '1px solid var(--border)' }}>
            {TABS.map(t => {
              const on = tab === t.key
              const urgent = t.key === 'queue' && counts.queue > 0
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    padding: '7px 6px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    background: on ? 'var(--ink)' : 'transparent',
                    color: on ? 'var(--gold)' : 'var(--text-muted)',
                    fontSize: '11px', fontWeight: on ? 700 : 500, transition: 'all 0.12s',
                  }}>
                  <t.icon size={12} />
                  {t.label}
                  {counts[t.key] > 0 && (
                    <span style={{ background: on ? 'rgba(192,155,58,0.25)' : urgent ? 'var(--jade)' : 'var(--sand-2)', color: on ? 'var(--gold)' : urgent ? '#fff' : 'var(--text-muted)', fontSize: '9px', fontWeight: 700, padding: '0 5px', borderRadius: '99px' }}>
                      {counts[t.key]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* List body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader size={18} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : tab === 'fu' ? (
              followups.length === 0
                ? <Empty icon={Zap} text="Sin seguimientos asignados" />
                : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {followups.map(f => <MyFollowupCard key={f.id} item={f} onDone={handleFollowupDone} />)}
                  </div>
            ) : list.length === 0 ? (
              <Empty icon={tab === 'queue' ? InboxIcon : MessageSquare}
                text={tab === 'queue' ? 'No hay conversaciones disponibles' : 'Sin conversaciones asignadas'} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {list.map(c => (
                  <ConvItem key={c.id} conv={c} active={selected?.id === c.id} sla={sla}
                    onClick={() => refreshSelected(c.id)}
                    onClaim={tab === 'queue' ? handleClaim : null} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: thread */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--gold-vp)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={22} style={{ color: 'var(--gold)' }} />
              </div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>Selecciona una conversación</p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '260px' }}>
                Toma una de la cola "Disponibles" o abre una de tus conversaciones asignadas.
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--sand-2)', border: '1.5px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--gold)' }}>
                    {initials(selected.contact?.name)}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{selected.contact?.name ?? 'Contacto'}</p>
                    <ChannelDot type={selected.channel?.type} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button onClick={handleRelease} className="btn-outline" style={{ padding: '6px 12px', fontSize: '11px' }} title="Devuelve la conversación a la IA">
                    <CornerUpLeft size={11} /> Devolver a IA
                  </button>
                  <button onClick={handleClose} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', background: 'transparent', color: 'var(--crimson)', border: '1px solid rgba(122,28,42,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                    <CheckCircle size={11} /> Cerrar
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'var(--sand)' }}>
                {(selected.messages ?? []).map(m => <Bubble key={m.id} msg={m} />)}
                <div ref={endRef} />
              </div>

              {/* Compose */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Escribe tu respuesta…"
                  rows={1}
                  style={{ flex: 1, resize: 'none', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', outline: 'none', maxHeight: '120px', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <button onClick={handleSend} disabled={sending || !draft.trim()}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', flexShrink: 0, cursor: draft.trim() ? 'pointer' : 'default', background: draft.trim() ? 'var(--gold)' : 'var(--sand-2)', color: draft.trim() ? 'var(--ink)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: draft.trim() ? '0 0 12px rgba(192,155,58,0.3)' : 'none', transition: 'all 0.15s' }}>
                  {sending ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  )
}

function Empty({ icon: Icon, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: '8px' }}>
      <Icon size={20} style={{ color: 'var(--border)' }} />
      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>{text}</p>
    </div>
  )
}
