import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import { getOverview } from '../../services/accounts'
import { reportError } from '../../store/errors'
import {
  MessageSquare, Bot, Users, Hand, Zap, Radio, AlertTriangle,
  Wallet, TrendingUp, Loader, Activity,
} from 'lucide-react'

const GOLD = '#C09B3A'

const STAGES = [
  { key: 'new',       label: 'Nuevo',      color: 'var(--text-muted)' },
  { key: 'contacted', label: 'Contactado', color: '#3B82F6' },
  { key: 'qualified', label: 'Calificado', color: GOLD },
  { key: 'proposal',  label: 'Propuesta',  color: 'var(--jade)' },
  { key: 'closed',    label: 'Cerrado',    color: '#10B981' },
]

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

// ── Radial gauge (AI containment) ───────────────────────────────────
function Gauge({ pct }) {
  const r = 56, C = 2 * Math.PI * r
  const off = C * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={`Contención IA ${pct}%`}>
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
      <text x="74" y="70" textAnchor="middle" fontFamily="var(--font-display)" fontSize="34"
        fontWeight="700" fill="#F6EFDC">{pct}<tspan fontSize="16" fill={GOLD}>%</tspan></text>
      <text x="74" y="92" textAnchor="middle" fontSize="9.5" letterSpacing="1.5"
        fill="rgba(246,239,220,0.55)">RESUELTO IA</text>
    </svg>
  )
}

// ── Sparkline (area) ────────────────────────────────────────────────
function Sparkline({ values = [], stroke = GOLD, id }) {
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
    <svg width="100%" height="44" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
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

// ── Small pieces ────────────────────────────────────────────────────
function HeroStat({ icon: Icon, label, value, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '11px', flexShrink: 0,
        background: 'rgba(192,155,58,0.14)', border: '1px solid rgba(192,155,58,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} style={{ color: GOLD }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '23px', fontWeight: 700, color: '#F6EFDC',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'rgba(246,239,220,0.55)' }}>{label}{hint ? ` · ${hint}` : ''}</p>
      </div>
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

function OpChip({ icon: Icon, label, value, tone = 'neutral', urgent = false }) {
  const tones = {
    neutral: { c: 'var(--text)', bg: 'var(--sand)', i: 'var(--text-muted)' },
    jade:    { c: 'var(--jade)', bg: 'var(--jade-pale)', i: 'var(--jade)' },
    gold:    { c: 'var(--gold)', bg: 'var(--gold-vp)', i: GOLD },
    crimson: { c: 'var(--crimson)', bg: 'var(--crimson-pale)', i: 'var(--crimson)' },
  }
  const t = tones[tone]
  return (
    <div style={{ flex: '1 1 150px', display: 'flex', alignItems: 'center', gap: '11px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '13px 15px' }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: t.bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <Icon size={15} style={{ color: t.i }} />
        {urgent && <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '9px', height: '9px',
          borderRadius: '50%', background: 'var(--crimson)', border: '2px solid var(--surface)' }} />}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: t.c,
          fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
        <p style={{ margin: '3px 0 0', fontSize: '10.5px', color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

const nf = (n) => (n ?? 0).toLocaleString('es-MX')

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

  const h = d.headline, ai = d.ai, ops = d.ops, leads = d.leads
  const chTotal = d.channels.reduce((s, c) => s + c.count, 0) || 1
  const aiShare = ai.ai_messages_7d + ai.customer_messages_7d
    ? Math.round(ai.ai_messages_7d / (ai.ai_messages_7d + ai.customer_messages_7d) * 100) : 0

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
      {/* ── Hero: el faro — contención de IA + titulares ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0C1A2E 0%, #0B1728 60%, #091320 100%)',
        border: '1px solid rgba(192,155,58,0.22)', borderRadius: '18px',
        padding: '24px 28px', marginBottom: '16px', position: 'relative', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: 'auto 1px 1fr', gap: '28px', alignItems: 'center',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(420px 200px at 12% 0%, rgba(192,155,58,0.16), transparent 70%)' }} />

        {/* Gauge */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <Gauge pct={h.ai_containment_rate} />
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'rgba(246,239,220,0.6)' }}>
            últimos 7 días · {nf(ai.handoffs_7d)} a humano de {nf(ai.conversations_7d)}
          </p>
        </div>

        <div style={{ background: 'rgba(192,155,58,0.18)', width: '1px', height: '100%' }} />

        {/* Headline stats 2×2 */}
        <div style={{ position: 'relative', zIndex: 1, display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: '20px 28px' }}>
          <HeroStat icon={MessageSquare} label="Conversaciones hoy" value={nf(h.conversations_today)} hint={`${nf(h.conversations_total)} históricas`} />
          <HeroStat icon={Radio} label="Mensajes hoy" value={nf(h.messages_today)} />
          <HeroStat icon={Hand} label="En atención humana" value={nf(h.human_active)} />
          <HeroStat icon={TrendingUp} label="Leads (7 días)" value={nf(h.leads_week)} />
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

      {/* ── Canales + Pipeline ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <Panel title="Mezcla de canales" icon={MessageSquare}>
          {d.channels.length === 0 ? (
            <Empty text="Aún no hay conversaciones por canal" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {d.channels.map(c => {
                const pct = Math.round(c.count / chTotal * 100)
                return (
                  <div key={c.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-mid)', fontWeight: 500 }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CHANNEL_DOT[c.label] || GOLD }} />
                        {c.label}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{nf(c.count)} · {pct}%</span>
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

        <Panel title="Pipeline de leads" icon={TrendingUp}
          action={leads.value_usd && Number(leads.value_usd) > 0
            ? <span style={{ fontSize: '11px', color: 'var(--jade)', fontWeight: 600 }}>${nf(Math.round(Number(leads.value_usd)))} en juego</span>
            : null}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
            {STAGES.map(s => {
              const count = leads.by_stage[s.key] || 0
              const pct = leads.total ? Math.round(count / leads.total * 100) : 0
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-mid)', width: '78px', flexShrink: 0 }}>{s.label}</span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--sand-2)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: '99px', background: s.color, transition: 'width 0.7s ease' }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', width: '28px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nf(count)}</span>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total de leads</span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{nf(leads.total)}</span>
          </div>
        </Panel>
      </div>

      {/* ── Operación en vivo ── */}
      <h2 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-mid)', margin: '0 0 12px',
        textTransform: 'uppercase', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Zap size={13} style={{ color: GOLD }} /> Operación en vivo
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <OpChip icon={Users} label="Agentes en línea" value={`${nf(ops.agents_online)}/${nf(ops.agents_total)}`} tone="jade" />
        <OpChip icon={AlertTriangle} label="Alertas SLA abiertas" value={nf(ops.sla_open)} tone={ops.sla_open > 0 ? 'crimson' : 'neutral'} urgent={ops.sla_open > 0} />
        <OpChip icon={Hand} label="Seguimientos pendientes" value={nf(ops.followups_open)} tone={ops.followups_open > 0 ? 'gold' : 'neutral'} />
        <OpChip icon={Wallet} label={`Saldo · gasto 7d $${ai.cost_7d}`} value={`$${d.credits.balance_usd}`} tone={d.credits.low ? 'crimson' : 'neutral'} urgent={d.credits.low} />
      </div>
    </PageShell>
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
