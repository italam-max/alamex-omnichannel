import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import {
  MessageSquare, CheckCircle, Clock, AlertTriangle,
  RefreshCw, User, Bot, Loader, ExternalLink,
  Zap, Activity, UserCheck, ArrowRight, X,
} from 'lucide-react'
import { mockConversations } from '../../mocks/conversations'
import api from '../../services/api'
import { getWorkspace, getAgents, reassignConversation } from '../../services/accounts'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// ── SLA Tier System ───────────────────────────────────────────────────────────
// Thresholds are loaded from the workspace business rules — never hardcoded.

const DEFAULT_SLA = { warning: 5, critical: 10, escalate: 15 }

function getSlaTier(min, sla = DEFAULT_SLA) {
  if (min < sla.warning)  return 'ok'
  if (min < sla.critical) return 'warning'
  if (min < sla.escalate) return 'critical'
  return 'escalated'
}

const TIER_CFG = {
  ok:        { label: 'OK',        color: 'var(--jade)',    bg: 'var(--jade-pale)',    border: 'rgba(26,92,58,0.2)',   glow: 'rgba(26,92,58,0.3)' },
  warning:   { label: 'Aviso',     color: '#D97706',        bg: '#FFFBEB',             border: 'rgba(217,119,6,0.25)', glow: 'rgba(217,119,6,0.3)' },
  critical:  { label: 'Crítico',   color: 'var(--crimson)', bg: 'var(--crimson-pale)', border: 'rgba(122,28,42,0.25)', glow: 'rgba(122,28,42,0.35)' },
  escalated: { label: 'Escalada',  color: 'var(--crimson)', bg: 'var(--crimson-pale)', border: 'rgba(122,28,42,0.4)',  glow: 'rgba(122,28,42,0.5)' },
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  { id: 1, name: 'Ana García',  initials: 'AG', status: 'online', active: 2, color: 'var(--jade)' },
  { id: 2, name: 'Carlos Ruiz', initials: 'CR', status: 'busy',   active: 4, color: 'var(--gold)' },
  { id: 3, name: 'María López', initials: 'ML', status: 'away',   active: 0, color: 'var(--text-muted)' },
  { id: 4, name: 'Pedro Ruiz',  initials: 'PR', status: 'online', active: 1, color: 'var(--jade)' },
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
  ...c, waitSince: c.updated_at,
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

const PRIORITY_CFG = {
  high:   { label: 'Alta',  bg: 'var(--crimson-pale)', text: 'var(--crimson)', border: 'rgba(122,28,42,0.2)', dot: 'var(--crimson)' },
  medium: { label: 'Media', bg: 'var(--gold-vp)',       text: 'var(--text-mid)', border: 'rgba(192,155,58,0.25)', dot: 'var(--gold)' },
  low:    { label: 'Baja',  bg: 'var(--jade-pale)',     text: 'var(--jade)',    border: 'rgba(26,92,58,0.2)', dot: 'var(--jade)' },
}

const CHANNEL_CFG = {
  whatsapp:  { label: 'WhatsApp',  dot: '#25D366' },
  instagram: { label: 'Instagram', dot: '#E1306C' },
  messenger: { label: 'Messenger', dot: '#0084FF' },
  website:   { label: 'Web',       dot: 'var(--gold)' },
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

// Segmented SLA bar with 3 zone markers (OK / AVISO / CRÍTICO / ESCALADA)
function SlaBar({ waitMin, sla = DEFAULT_SLA }) {
  const limit = sla.escalate
  const pct  = Math.min(100, (waitMin / limit) * 100)
  const tier = getSlaTier(waitMin, sla)
  const cfg  = TIER_CFG[tier]
  const isEscalated = tier === 'escalated'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['ok','warning','critical','escalated'].map(t => {
            const active = tier === t
            const tc = TIER_CFG[t]
            return (
              <span key={t} style={{
                fontSize: '9px', fontWeight: active ? 700 : 500,
                color: active ? tc.color : 'var(--text-muted)',
                opacity: active ? 1 : 0.45,
                textTransform: 'uppercase', letterSpacing: '0.4px',
                transition: 'all 0.2s',
              }}>
                {tc.label}
              </span>
            )
          })}
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: cfg.color }}>
          {isEscalated ? `+${waitMin - limit}m fuera` : formatWait(waitMin)}
        </span>
      </div>

      {/* Bar track with zone dividers at the configured thresholds */}
      <div style={{ position: 'relative', height: '5px', background: 'var(--sand-2)', borderRadius: '99px', overflow: 'visible' }}>
        {[sla.warning, sla.critical].map(min => (
          <div key={min} style={{
            position: 'absolute', top: '-2px', left: `${Math.min(100, (min / limit) * 100)}%`,
            width: '1px', height: '9px',
            background: 'var(--border)', zIndex: 1,
          }} />
        ))}
        {/* Fill */}
        <div style={{
          height: '100%',
          width: `${Math.min(pct, 100)}%`,
          borderRadius: '99px',
          background: cfg.color,
          boxShadow: pct >= 60 ? `0 0 6px ${cfg.glow}` : 'none',
          transition: 'width 0.5s ease, background 0.4s ease',
          overflow: 'hidden',
        }}>
          {isEscalated && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 8px)',
            }} />
          )}
        </div>
      </div>

      {/* Zone labels below — at the configured thresholds */}
      <div style={{ position: 'relative', height: '12px', marginTop: '3px' }}>
        <span style={{ position: 'absolute', left: 0, fontSize: '8px', color: 'var(--text-muted)', opacity: 0.5 }}>0</span>
        {[sla.warning, sla.critical].map(min => (
          <span key={min} style={{ position: 'absolute', left: `${Math.min(100, (min / limit) * 100)}%`, transform: 'translateX(-50%)', fontSize: '8px', color: 'var(--text-muted)', opacity: 0.5 }}>{min}m</span>
        ))}
        <span style={{ position: 'absolute', right: 0, fontSize: '8px', color: 'var(--text-muted)', opacity: 0.5 }}>{limit}m</span>
      </div>
    </div>
  )
}

// ── Reassign Modal ────────────────────────────────────────────────────────────

function ReassignModal({ conv, agents, onAssign, onClose }) {
  const name = conv.contact?.name ?? conv.contact_name ?? 'Sin nombre'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(11,23,40,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
        animation: 'menuIn 0.15s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div style={{
        width: '380px',
        background: 'var(--surface)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(11,23,40,0.22), 0 4px 16px rgba(11,23,40,0.1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'var(--crimson-pale)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <UserCheck size={14} style={{ color: 'var(--crimson)' }} />
              </div>
              <h3 style={{
                margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)',
                fontFamily: "Georgia, serif",
              }}>
                Reasignar conversación
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
              Selecciona un agente para atender a <strong>{name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Agent list */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {agents
            .sort((a, b) => {
              const order = { online: 0, busy: 1, away: 2 }
              return (order[a.status] ?? 3) - (order[b.status] ?? 3)
            })
            .map(agent => {
              const st = AGENT_STATUS[agent.status] ?? AGENT_STATUS.away
              const canAssign = agent.status !== 'away'
              return (
                <div
                  key={agent.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px',
                    background: canAssign ? 'var(--surface)' : 'var(--sand)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    opacity: canAssign ? 1 : 0.55,
                  }}
                >
                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '50%',
                      background: 'var(--sand-2)',
                      border: `1.5px solid ${agent.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700, color: agent.color,
                    }}>
                      {agent.initials}
                    </div>
                    <span style={{
                      position: 'absolute', bottom: '0', right: '0',
                      width: '9px', height: '9px', borderRadius: '50%',
                      background: st.dot,
                      border: '1.5px solid var(--surface)',
                      boxShadow: agent.status !== 'away' ? `0 0 5px ${st.glow}` : 'none',
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {agent.name}
                    </p>
                    <p style={{ margin: '1px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
                      {st.label} · {agent.active} conv. activas
                    </p>
                  </div>

                  {/* Assign button */}
                  <button
                    onClick={() => canAssign && onAssign(conv, agent)}
                    disabled={!canAssign}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: canAssign
                        ? agent.status === 'online' ? 'var(--jade)' : 'var(--sand-2)'
                        : 'var(--sand-2)',
                      color: canAssign
                        ? agent.status === 'online' ? '#fff' : 'var(--text-mid)'
                        : 'var(--text-muted)',
                      fontSize: '11px', fontWeight: 600,
                      cursor: canAssign ? 'pointer' : 'not-allowed',
                      transition: 'all 0.12s',
                      boxShadow: canAssign && agent.status === 'online'
                        ? '0 0 10px rgba(26,92,58,0.3)'
                        : 'none',
                    }}
                  >
                    Asignar
                    {canAssign && <ArrowRight size={10} />}
                  </button>
                </div>
              )
            })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            className="btn-outline"
            style={{ padding: '7px 16px', fontSize: '12px' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── HumanWaitCard (4-tier SLA) ────────────────────────────────────────────────

function HumanWaitCard({ conv, sla = DEFAULT_SLA, onGoto, onResolve, onReassign }) {
  const name    = conv.contact?.name ?? conv.contact_name ?? 'Sin nombre'
  const channel = conv.channel?.type ?? conv.channel_type ?? 'whatsapp'
  const waitMin = waitMinutes(conv.updated_at ?? conv.created_at)
  const tier    = getSlaTier(waitMin, sla)
  const cfg     = TIER_CFG[tier]
  const isEscalated = tier === 'escalated'
  const isCritical  = tier === 'critical'

  return (
    <div
      className={isEscalated ? 'sla-escalated' : ''}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${cfg.border}`,
        borderRadius: '12px',
        padding: '14px 16px',
        borderLeft: `3px solid ${cfg.color}`,
        transition: 'border-color 0.3s',
        boxShadow: isEscalated
          ? `0 2px 12px ${cfg.glow}40`
          : '0 1px 4px rgba(11,23,40,0.05)',
      }}
    >
      {/* Contact row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: cfg.bg,
              border: `1.5px solid ${cfg.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, color: cfg.color,
            }}>
              {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            {(isCritical || isEscalated) && (
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

        {/* Tier badge */}
        <div style={{ textAlign: 'right' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '99px',
            background: cfg.bg, color: cfg.color,
            fontSize: '10px', fontWeight: 700,
            border: `1px solid ${cfg.border}`,
            letterSpacing: '0.3px',
            boxShadow: isEscalated ? `0 0 8px ${cfg.glow}` : 'none',
          }}>
            {(isCritical || isEscalated) && <AlertTriangle size={9} />}
            {isEscalated ? `ESCALADA · ${formatWait(waitMin)}` : formatWait(waitMin)}
          </span>
          {tier !== 'ok' && (
            <p style={{ margin: '3px 0 0', fontSize: '9px', color: cfg.color, textAlign: 'right', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              {tier === 'warning' ? 'Sin respuesta' : tier === 'critical' ? 'Crítico' : 'Requiere reasignación'}
            </p>
          )}
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
        <SlaBar waitMin={waitMin} sla={sla} />
      </div>

      {/* Actions — escalated shows Reasignar as primary */}
      <div style={{ display: 'flex', gap: '7px' }}>
        {isEscalated ? (
          <>
            <button
              onClick={() => onReassign(conv)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px', borderRadius: '8px',
                background: 'var(--crimson)', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                boxShadow: '0 0 12px rgba(122,28,42,0.35)',
                transition: 'box-shadow 0.15s',
                flex: 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 18px rgba(122,28,42,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 12px rgba(122,28,42,0.35)')}
            >
              <UserCheck size={12} /> Reasignar ahora
            </button>
            <button onClick={() => onGoto(conv)} className="btn-outline" style={{ padding: '7px 14px', fontSize: '11px' }}>
              <MessageSquare size={11} /> Atender
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onGoto(conv)} className="btn-gold" style={{ padding: '6px 14px', fontSize: '11px' }}>
              <MessageSquare size={11} /> Atender
            </button>
            {isCritical && (
              <button
                onClick={() => onReassign(conv)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 14px', borderRadius: '8px',
                  background: 'var(--crimson-pale)', color: 'var(--crimson)',
                  border: '1px solid rgba(122,28,42,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(122,28,42,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--crimson-pale)')}
              >
                <UserCheck size={11} /> Reasignar
              </button>
            )}
            <button onClick={() => onResolve(conv)} className="btn-outline" style={{ padding: '6px 14px', fontSize: '11px' }}>
              <CheckCircle size={11} /> Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── FollowUpCard ──────────────────────────────────────────────────────────────

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

      <div style={{ padding: '9px 12px', background: 'var(--sand)', borderRadius: '8px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '7px' }}>
          <Zap size={11} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-mid)', lineHeight: 1.55 }}>
            {item.reason}
          </p>
        </div>
      </div>

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

// ── AgentCard ─────────────────────────────────────────────────────────────────

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

// ── Alert banners ─────────────────────────────────────────────────────────────

function SlaAlertBanner({ escalated, critical, sla = DEFAULT_SLA }) {
  if (escalated === 0 && critical === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {escalated > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px',
          background: 'var(--crimson-pale)',
          border: '1px solid rgba(122,28,42,0.25)',
          borderRadius: '8px',
          boxShadow: '0 0 10px rgba(122,28,42,0.08)',
        }}>
          <AlertTriangle size={13} style={{ color: 'var(--crimson)', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: 'var(--crimson)', fontWeight: 700, flex: 1 }}>
            {escalated} {escalated === 1 ? 'conversación escalada' : 'conversaciones escaladas'} — SLA vencido, reasignación inmediata requerida
          </span>
        </div>
      )}
      {critical > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
          background: '#FFF8F8',
          border: '1px solid rgba(122,28,42,0.15)',
          borderRadius: '8px',
        }}>
          <Clock size={12} style={{ color: 'var(--crimson)', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: 'var(--crimson)', fontWeight: 600, flex: 1 }}>
            {critical} {critical === 1 ? 'conversación' : 'conversaciones'} en zona crítica ({sla.critical}–{sla.escalate} min)
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'followups', label: 'Seguimientos IA', icon: Zap },
  { key: 'human',     label: 'Atención humana', icon: User },
  { key: 'closed',    label: 'Cerrados',        icon: CheckCircle },
]

// Map a real API agent (availability/active_conversation_count) to the shape
// the visual cards expect (status/active/color).
function normalizeAgent(a) {
  const AVAIL_COLOR = { online: 'var(--jade)', busy: 'var(--gold)', away: 'var(--text-muted)' }
  return {
    id: a.id,
    name: a.name,
    initials: a.initials ?? (a.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2),
    status: a.availability ?? a.status ?? 'away',
    active: a.active_conversation_count ?? a.active ?? 0,
    color: AVAIL_COLOR[a.availability ?? a.status] ?? 'var(--text-muted)',
  }
}

export default function Leads() {
  const navigate = useNavigate()
  const [tab,          setTab]         = useState('followups')
  const [followups,    setFollowups]   = useState([])
  const [humanConvs,   setHumanConvs]  = useState([])
  const [agents,       setAgents]      = useState([])
  const [sla,          setSla]         = useState(DEFAULT_SLA)
  const [loading,      setLoading]     = useState(true)
  const [reassignConv, setReassignConv] = useState(null)
  const [, setTick] = useState(0)  // force re-render for live timers

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
        setAgents(MOCK_AGENTS)
      } else {
        const [fuRes, huRes, ags, ws] = await Promise.all([
          api.get('/contacts/followups/?status=open&status=in_progress', { meta: { silent: true } }).catch(() => ({ data: [] })),
          api.get('/conversations/?status=human_takeover', { meta: { silent: true } }).catch(() => ({ data: [] })),
          getAgents().catch(() => []),
          getWorkspace().catch(() => null),
        ])
        setFollowups(fuRes.data.results ?? fuRes.data)
        setHumanConvs(huRes.data.results ?? huRes.data)
        setAgents(ags.filter(a => a.is_active).map(normalizeAgent))
        if (ws) setSla({
          warning:  ws.sla_warning_minutes  ?? DEFAULT_SLA.warning,
          critical: ws.sla_critical_minutes ?? DEFAULT_SLA.critical,
          escalate: ws.sla_escalate_minutes ?? DEFAULT_SLA.escalate,
        })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleGotoConv = () => navigate('/inbox')

  const handleCloseFollowup = (item) => {
    setFollowups(fs => fs.filter(f => f.id !== item.id))
  }

  const handleResolveConv = async (conv) => {
    try {
      if (!USE_MOCK) await api.patch(`/conversations/${conv.id}/update/`, { status: 'blocked' })
      setHumanConvs(cs => cs.filter(c => c.id !== conv.id))
    } catch { /* ignore */ }
  }

  const handleReassign = async (conv, agent) => {
    try {
      if (!USE_MOCK) await reassignConversation(conv.id, agent.id)
    } catch { /* ignore — surfaced by the optimistic update below */ }
    // Reassignment resets the wait clock — the conversation now has an owner.
    setHumanConvs(cs => cs.map(c =>
      c.id === conv.id
        ? { ...c, updated_at: new Date().toISOString(), assigned_to_name: agent.name }
        : c
    ))
    setReassignConv(null)
  }

  // Tier grouping
  const byTier = (tier) => humanConvs.filter(c => {
    const min = waitMinutes(c.updated_at ?? c.created_at)
    return getSlaTier(min, sla) === tier
  })

  const escalatedConvs = byTier('escalated')
  const criticalConvs  = byTier('critical')
  const warningConvs   = byTier('warning')
  const okConvs        = byTier('ok')

  const openFollowups   = followups.filter(f => f.status === 'open')
  const inProgFollowups = followups.filter(f => f.status === 'in_progress')
  const allOpen         = [...openFollowups, ...inProgFollowups]

  const tabCounts = {
    followups: allOpen.length,
    human:     humanConvs.length,
    closed:    0,
  }

  const hasUrgent = escalatedConvs.length > 0 || criticalConvs.length > 0

  return (
    <PageShell
      title="Seguimientos"
      subtitle="Flujo de atención, seguimientos pendientes y agentes"
    >
      <div style={{ display: 'flex', gap: '20px', height: '100%', minHeight: 0 }}>

        {/* ── Main panel ────────────────────────────────────────── */}
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
                const isCriticalTab = t.key === 'human' && hasUrgent
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
                          : isCriticalTab ? 'var(--crimson)' : 'var(--sand-2)',
                        color: active ? 'var(--gold)' : isCriticalTab ? '#fff' : 'var(--text-muted)',
                        fontSize: '9px', fontWeight: 700,
                        padding: '1px 6px', borderRadius: '99px',
                        boxShadow: isCriticalTab ? '0 0 5px rgba(122,28,42,0.4)' : 'none',
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
              ) : allOpen.map(f => (
                <FollowUpCard key={f.id} item={f} onGoto={handleGotoConv} onClose={handleCloseFollowup} />
              ))}
            </div>

          ) : tab === 'human' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {humanConvs.length === 0 ? (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <EmptyTab icon={User} title="Sin conversaciones esperando" sub="Cuando una conversación se pase a atención humana aparecerá aquí con su SLA." />
                </div>
              ) : (
                <>
                  <SlaAlertBanner escalated={escalatedConvs.length} critical={criticalConvs.length} sla={sla} />

                  {/* Escalated section */}
                  {escalatedConvs.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(122,28,42,0.15)' }} />
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--crimson)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                          SLA vencido — escaladas
                        </span>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(122,28,42,0.15)' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {escalatedConvs.map(c => (
                          <HumanWaitCard key={c.id} conv={c} sla={sla} onGoto={handleGotoConv} onResolve={handleResolveConv} onReassign={setReassignConv} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Critical + Warning + OK */}
                  {[...criticalConvs, ...warningConvs, ...okConvs].length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[...criticalConvs, ...warningConvs, ...okConvs].map(c => (
                        <HumanWaitCard key={c.id} conv={c} sla={sla} onGoto={handleGotoConv} onResolve={handleResolveConv} onReassign={setReassignConv} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <EmptyTab icon={CheckCircle} title="Sin registros cerrados hoy" sub="Los seguimientos y conversaciones cerrados aparecerán aquí." />
            </div>
          )}
        </div>

        {/* ── Right panel: Stats + Agents ───────────────────────── */}
        <div style={{ width: '256px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Stats */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px',
            boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Resumen SLA
            </p>
            {[
              { label: `Escaladas  >${sla.escalate}m`,             value: escalatedConvs.length, color: escalatedConvs.length > 0 ? 'var(--crimson)' : 'var(--jade)', glow: escalatedConvs.length > 0 },
              { label: `Críticas  ${sla.critical}–${sla.escalate}m`, value: criticalConvs.length,  color: criticalConvs.length > 0 ? 'var(--crimson)' : 'var(--jade)', glow: false },
              { label: `Aviso  ${sla.warning}–${sla.critical}m`,     value: warningConvs.length,   color: warningConvs.length > 0 ? '#D97706' : 'var(--jade)', glow: false },
              { label: 'Seguimientos abiertos',                       value: allOpen.length,        color: 'var(--gold)', glow: false },
            ].map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid var(--sand)',
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--jade)', fontWeight: 600 }}>
                <Activity size={10} />
                {agents.filter(a => a.status === 'online').length} en línea
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {agents.length === 0 ? (
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                  Sin agentes activos.
                </p>
              ) : agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4, textAlign: 'center' }}>
              Gestiona el equipo y sus canales en la sección <strong>Agentes</strong>.
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

      {/* Reassign modal */}
      {reassignConv && (
        <ReassignModal
          conv={reassignConv}
          agents={agents}
          onAssign={handleReassign}
          onClose={() => setReassignConv(null)}
        />
      )}
    </PageShell>
  )
}
