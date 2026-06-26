import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import { getOverview } from '../../services/accounts'
import { reportError } from '../../store/errors'
import {
  MessageSquare, Bot, Users, Hand, Zap, AlertTriangle,
  TrendingUp, Loader, Activity,
} from 'lucide-react'

const GOLD = '#C09B3A'
const IVORY = '#F6EFDC'

const CHANNEL_DOT = {
  WhatsApp: '#25D366', Instagram: '#E1306C', Messenger: '#0084FF', Web: GOLD,
}

const EMPTY = {
  headline: { conversations_today: 0, conversations_total: 0, messages_today: 0, ai_containment_rate: 0, human_active: 0, leads_week: 0 },
  ai: { ai_messages_7d: 0, customer_messages_7d: 0, handoffs_7d: 0, conversations_7d: 0, tokens_in_7d: 0, tokens_out_7d: 0, cost_7d: '0' },
  credits: { balance_usd: '0', alert_threshold_usd: '0', low: false },
  channels: [],
  leads: { by_stage: {}, total: 0, value_usd: '0' },
  ops: { sla_open: 0, agents_online: 0, agents_total: 0, followups_open: 0 },
  series: { days: [], conversations: [], ai_messages: [] },
}

const nf = (n) => (n ?? 0).toLocaleString('es-MX')
function fmtK(n) {
  n = n ?? 0
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return nf(n)
}

// ── Radial gauge (AI containment) ───────────────────────────────────
function Gauge({ pct }) {
  const r = 56, C = 2 * Math.PI * r
  const off = C * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <svg width="150" height="150" viewBox="0 0 148 148" role="img" aria-label={`Contención IA ${pct}%`}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E4C463" />
          <stop offset="100%" stopColor="#A87E1E" />
        </linearGradient>
        <filter id="gaugeGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="74" cy="74" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="11" />
      <circle cx="74" cy="74" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="11"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
        transform="rotate(-90 74 74)" filter="url(#gaugeGlow)"
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }} />
      <text x="74" y="70" textAnchor="middle" fontFamily="var(--font-display)" fontSize="36"
        fontWeight="700" fill={IVORY}>{pct}<tspan fontSize="17" fill={GOLD}>%</tspan></text>
      <text x="74" y="92" textAnchor="middle" fontSize="9.5" letterSpacing="1.5"
        fill="rgba(246,239,220,0.55)">RESUELTO IA</text>
    </svg>
  )
}

// ── Sparkline (area) ────────────────────────────────────────────────
function Sparkline({ values = [], stroke = GOLD, id, height = 44 }) {
  const W = 100, H = 34
  const data = values.length ? values : [0, 0]
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => [
    data.length === 1 ? 0 : (i / (data.length - 1)) * W,
    H - (v / max) * (H - 5) - 2.5,
  ])
  const line = 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')
  const area = `${line} L ${W},${H} L 0,${H} Z`
  const last = pts[pts.length - 1]
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ── Hero pillar (premium, dark ground) ──────────────────────────────
function Pillar({ icon: Icon, label, value, unit, sub, valueColor = IVORY, border }) {
  return (
    <div style={{
      position: 'relative', zIndex: 1, flex: 1,
      paddingLeft: border ? '28px' : 0,
      borderLeft: border ? '1px solid rgba(192,155,58,0.16)' : 'none',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0,
    }}>
      <p style={{ margin: '0 0 12px', fontSize: '10.5px', letterSpacing: '1.4px', textTransform: 'uppercase',
        color: 'rgba(246,239,220,0.55)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
        {Icon && <Icon size={12} style={{ color: GOLD }} />}{label}
      </p>
      <p style={{ margin: 0, fontSize: '42px', lineHeight: 0.95, fontWeight: 700, color: valueColor,
        fontFamily: 'var(--font-display)', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
        {value}{unit && <span style={{ fontSize: '19px', color: GOLD, marginLeft: '3px' }}>{unit}</span>}
      </p>
      {sub && <p style={{ margin: '11px 0 0', fontSize: '11.5px', color: 'rgba(246,239,220,0.6)' }}>{sub}</p>}
    </div>
  )
}

// ── Channel pillar (dynamic, brand-colored) ─────────────────────────
function ChannelPillar({ label, today, total, color, border }) {
  return (
    <div style={{
      position: 'relative', zIndex: 1, flex: 1, minWidth: 0,
      paddingLeft: border ? '28px' : 0,
      borderLeft: border ? '1px solid rgba(192,155,58,0.16)' : 'none',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <p style={{ margin: '0 0 12px', fontSize: '10.5px', letterSpacing: '1.2px', textTransform: 'uppercase',
        color: 'rgba(246,239,220,0.6)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, background: color,
          boxShadow: `0 0 8px ${color}` }} />
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '42px', lineHeight: 0.95, fontWeight: 700, color,
        fontFamily: 'var(--font-display)', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums',
        textShadow: `0 0 22px ${color}55` }}>
        {nf(today)}
      </p>
      <p style={{ margin: '11px 0 0', fontSize: '11.5px', color: 'rgba(246,239,220,0.6)' }}>
        hoy · {nf(total)} históricas
      </p>
    </div>
  )
}

// ── Premium chip (hero row B) ───────────────────────────────────────
const CHIP_COLOR = { gold: GOLD, jade: '#6FD19B', crimson: '#E8927C', neutral: IVORY }
function HeroChip({ icon: Icon, label, value, tone = 'neutral', urgent = false, border }) {
  const c = CHIP_COLOR[tone]
  return (
    <div style={{
      position: 'relative', zIndex: 1,
      paddingLeft: border ? '22px' : 0,
      borderLeft: border ? '1px solid rgba(192,155,58,0.14)' : 'none',
    }}>
      <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: c, lineHeight: 1,
        fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px',
        display: 'flex', alignItems: 'center', gap: '7px' }}>
        {value}
        {urgent && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#E8927C',
          boxShadow: '0 0 7px rgba(232,146,124,0.7)' }} />}
      </p>
      <p style={{ margin: '7px 0 0', fontSize: '10.5px', letterSpacing: '0.6px', color: 'rgba(246,239,220,0.55)',
        textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {Icon && <Icon size={11} style={{ color: 'rgba(246,239,220,0.4)' }} />}{label}
      </p>
    </div>
  )
}

function Panel({ title, icon: Icon, children, action }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(11,23,40,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700,
          color: 'var(--text-mid)', margin: 0, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          {Icon && <Icon size={13} style={{ color: GOLD }} />}{title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function Overview() {
  const [d, setD] = useState(EMPTY)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await getOverview()
      setD({ ...EMPTY, ...data })
    } catch (e) {
      reportError(e, 'Cargar overview')
      setD(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const h = d.headline, ai = d.ai, ops = d.ops
  const mixChannels = d.channels.filter(c => c.total > 0)
  const chTotal = mixChannels.reduce((s, c) => s + c.total, 0) || 1
  const msgTotal = ai.ai_messages_7d + ai.customer_messages_7d
  const aiShare = msgTotal ? Math.round(ai.ai_messages_7d / msgTotal * 100) : 0
  const balColor = d.credits.low ? '#E8927C' : IVORY

  if (loading) {
    return (
      <PageShell title="Centro de mando" subtitle="Tu operación omnicanal en tiempo real">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
          <Loader size={22} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Reuniendo señales de todos los canales…</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell title="Centro de mando" subtitle="Tu operación omnicanal en tiempo real">
      {/* ── Hero premium: pilares + franja de KPIs (un solo bloque) ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0C1A2E 0%, #0B1728 60%, #091320 100%)',
        border: '1px solid rgba(192,155,58,0.22)', borderRadius: '18px',
        padding: '26px 30px', marginBottom: '16px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(480px 240px at 10% 0%, rgba(192,155,58,0.16), transparent 70%)' }} />

        {/* Fila A — gauge + saldo + KPIs por canal (dinámico) */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', flexShrink: 0, paddingRight: '10px' }}>
            <Gauge pct={h.ai_containment_rate} />
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'rgba(246,239,220,0.6)' }}>
              7 días · {nf(ai.handoffs_7d)} a humano de {nf(ai.conversations_7d)}
            </p>
          </div>
          <Pillar border label="Saldo disponible" value={`$${d.credits.balance_usd}`} valueColor={balColor}
            sub={d.credits.low ? `⚠ Saldo bajo · gasto 7d $${ai.cost_7d}` : `Gasto 7 días · $${ai.cost_7d}`} />
          {d.channels.length === 0 ? (
            <div style={{ flex: 1, paddingLeft: '28px', borderLeft: '1px solid rgba(192,155,58,0.16)' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(246,239,220,0.6)' }}>
                Conecta un canal para ver sus conversaciones aquí.
              </p>
            </div>
          ) : (
            d.channels.map(c => (
              <ChannelPillar key={c.type} border label={c.label} today={c.today} total={c.total}
                color={CHANNEL_DOT[c.label] || GOLD} />
            ))
          )}
        </div>

        {/* Divisor */}
        <div style={{ height: '1px', background: 'rgba(192,155,58,0.16)', margin: '24px 0 20px', position: 'relative', zIndex: 1 }} />

        {/* Fila B — KPIs operativos (mismo estilo premium) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0', position: 'relative', zIndex: 1 }}>
          <HeroChip icon={Hand} label="En atención humana" value={nf(h.human_active)} tone={h.human_active > 0 ? 'crimson' : 'neutral'} urgent={h.human_active > 0} />
          <HeroChip border icon={TrendingUp} label="Leads · 7 días" value={nf(h.leads_week)} tone="jade" />
          <HeroChip border icon={Users} label="Agentes en línea" value={`${nf(ops.agents_online)}/${nf(ops.agents_total)}`} tone="jade" />
          <HeroChip border icon={AlertTriangle} label="Alertas SLA" value={nf(ops.sla_open)} tone={ops.sla_open > 0 ? 'crimson' : 'neutral'} urgent={ops.sla_open > 0} />
          <HeroChip border icon={Zap} label="Seguimientos" value={nf(ops.followups_open)} tone={ops.followups_open > 0 ? 'gold' : 'neutral'} />
        </div>
      </div>

      {/* ── Actividad: sparklines 7 días ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <Panel title="Conversaciones · 7 días" icon={Activity}>
          <Sparkline values={d.series.conversations} stroke={GOLD} id="spkConv" />
          <DayAxis days={d.series.days} />
        </Panel>
        <Panel title="Respuestas de IA · 7 días" icon={Bot}
          action={<span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{aiShare}% del tráfico</span>}>
          <Sparkline values={d.series.ai_messages} stroke="var(--jade)" id="spkAi" />
          <DayAxis days={d.series.days} />
        </Panel>
      </div>

      {/* ── Canales + Salud de la IA ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Panel title="Mezcla de canales" icon={MessageSquare}>
          {mixChannels.length === 0 ? (
            <Empty text="Aún no hay conversaciones por canal" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {mixChannels.map(c => {
                const pct = Math.round(c.total / chTotal * 100)
                return (
                  <div key={c.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-mid)', fontWeight: 500 }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CHANNEL_DOT[c.label] || GOLD }} />
                        {c.label}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{nf(c.total)} · {pct}%</span>
                    </div>
                    <div style={{ height: '7px', background: 'var(--sand-2)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: '99px',
                        background: CHANNEL_DOT[c.label] || GOLD, transition: 'width 0.7s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Salud de la IA · 7 días" icon={Bot}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text-mid)', fontWeight: 500 }}>Reparto de mensajes</p>
          <div style={{ display: 'flex', height: '12px', borderRadius: '99px', overflow: 'hidden', background: 'var(--sand-2)' }}>
            <div style={{ width: `${aiShare}%`, background: 'var(--jade)', transition: 'width 0.7s ease' }} />
            <div style={{ width: `${100 - aiShare}%`, background: GOLD, transition: 'width 0.7s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px', fontSize: '11px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-mid)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--jade)' }} /> IA {nf(ai.ai_messages_7d)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-mid)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: GOLD }} /> Cliente {nf(ai.customer_messages_7d)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '18px',
            paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <MiniStat label="Escaladas" value={nf(ai.handoffs_7d)} />
            <MiniStat label="Tokens" value={fmtK(ai.tokens_in_7d + ai.tokens_out_7d)} />
            <MiniStat label="Costo" value={`$${ai.cost_7d}`} />
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: 'var(--text)',
        fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{value}</p>
      <p style={{ margin: '3px 0 0', fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
    </div>
  )
}

function DayAxis({ days = [] }) {
  if (!days.length) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
      {days.map((d, i) => (
        <span key={i} style={{ fontSize: '9.5px', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>{d}</span>
      ))}
    </div>
  )
}

function Empty({ text }) {
  return <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', margin: 0 }}>{text}</p>
}
