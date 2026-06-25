import { mockKpis } from '../../mocks/kpis'
import PageShell from '../../components/layout/PageShell'
import { MessageSquare, Bot, Clock, TrendingUp, Zap } from 'lucide-react'

const STAGE_COLORS = {
  new:       'var(--text-muted)',
  contacted: '#3B82F6',
  qualified: 'var(--gold)',
  proposal:  'var(--jade)',
  closed:    '#10B981',
}

function KpiCard({ icon: Icon, label, value, sub, accent = 'gold' }) {
  const accentColor = accent === 'jade' ? 'var(--jade)'
    : accent === 'crimson' ? 'var(--crimson)'
    : 'var(--gold)'
  const accentPale = accent === 'jade' ? 'var(--jade-pale)'
    : accent === 'crimson' ? 'var(--crimson-pale)'
    : 'var(--gold-vp)'

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px', letterSpacing: '0.1px' }}>{label}</p>
        <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: "Georgia, serif", letterSpacing: '-0.5px' }}>{value}</p>
        {sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{sub}</p>}
      </div>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        background: accentPale,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={17} style={{ color: accentColor }} />
      </div>
    </div>
  )
}

function ChannelBar({ name, count, total, color }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-mid)', fontWeight: 500 }}>{name}</span>
        <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count} · {pct}%</span>
      </div>
      <div style={{ height: '6px', background: 'var(--sand-2)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '99px',
          width: `${pct}%`, backgroundColor: color,
          transition: 'width 0.7s ease',
        }} />
      </div>
    </div>
  )
}

function LeadStage({ label, count, colorKey }) {
  const color = STAGE_COLORS[colorKey] || 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '12px', color: 'var(--text-mid)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
  )
}

const CHANNEL_PALETTE = ['var(--gold)', 'var(--jade)', 'var(--crimson)', '#3B82F6', '#8B5CF6']

export default function Overview() {
  const kpis = mockKpis
  const totalConv = kpis.channels.reduce((s, c) => s + c.count, 0)

  const stages = [
    { label: 'Nuevo',      key: 'new' },
    { label: 'Contactado', key: 'contacted' },
    { label: 'Calificado', key: 'qualified' },
    { label: 'Propuesta',  key: 'proposal' },
    { label: 'Cerrado',    key: 'closed' },
  ]

  const totalLeads = Object.values(kpis.leads_by_stage).reduce((a, b) => a + b, 0)

  return (
    <PageShell title="Overview" subtitle="Resumen del día de hoy">
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <KpiCard icon={MessageSquare} label="Conversaciones hoy"   value={kpis.active_today}          sub={`${kpis.total_conversations} totales`}       accent="gold" />
        <KpiCard icon={Bot}          label="Resueltas por IA"      value={`${kpis.ai_resolution_rate}%`} sub="Sin intervención humana"                  accent="jade" />
        <KpiCard icon={Clock}        label="Tiempo de respuesta"   value={kpis.avg_response_time}     sub="Promedio hoy"                               accent="gold" />
        <KpiCard icon={Zap}          label="Atención humana"       value={kpis.human_takeover}         sub="Conversaciones activas"                    accent="crimson" />
        <KpiCard icon={TrendingUp}   label="Leads nuevos"          value={kpis.new_leads}              sub="Esta semana"                               accent="jade" />
        <KpiCard icon={MessageSquare} label="Mensajes hoy"         value={kpis.messages_today}         sub="Todos los canales"                         accent="gold" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        {/* Channels */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px',
          boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
        }}>
          <h2 style={{
            fontSize: '12px', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px',
            textTransform: 'uppercase', letterSpacing: '1px',
          }}>
            Conversaciones por canal
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {kpis.channels.map((c, i) => (
              <ChannelBar key={c.name} {...c} total={totalConv} color={CHANNEL_PALETTE[i % CHANNEL_PALETTE.length]} />
            ))}
          </div>
        </div>

        {/* Leads pipeline */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px',
          boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
        }}>
          <h2 style={{
            fontSize: '12px', fontWeight: 700, color: 'var(--text)', margin: '0 0 16px',
            textTransform: 'uppercase', letterSpacing: '1px',
          }}>
            Pipeline de leads
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {stages.map(s => (
              <LeadStage key={s.key} label={s.label} count={kpis.leads_by_stage[s.key]} colorKey={s.key} />
            ))}
          </div>
          <div style={{
            marginTop: '16px', paddingTop: '14px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between',
            fontSize: '12px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Total leads</span>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{totalLeads}</span>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
