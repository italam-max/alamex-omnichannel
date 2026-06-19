import { mockKpis } from '../../mocks/kpis'
import PageShell from '../../components/layout/PageShell'
import { MessageSquare, Users, Bot, Clock, TrendingUp, Zap } from 'lucide-react'

function KpiCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  }
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function ChannelBar({ name, count, total, color }) {
  const pct = Math.round((count / total) * 100)
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-600 font-medium">{name}</span>
        <span className="text-gray-400">{count} conv. · {pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function LeadStage({ label, count, color }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: color }} />
      <span className="text-sm text-gray-600 flex-1">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{count}</span>
    </div>
  )
}

export default function Overview() {
  const kpis = mockKpis
  const totalConv = kpis.channels.reduce((s, c) => s + c.count, 0)

  const stages = [
    { label: 'Nuevo', key: 'new', color: '#94a3b8' },
    { label: 'Contactado', key: 'contacted', color: '#60a5fa' },
    { label: 'Calificado', key: 'qualified', color: '#a78bfa' },
    { label: 'Propuesta', key: 'proposal', color: '#f59e0b' },
    { label: 'Cerrado', key: 'closed', color: '#10b981' },
  ]

  return (
    <PageShell title="Overview" subtitle="Resumen del día de hoy">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard icon={MessageSquare} label="Conversaciones hoy" value={kpis.active_today} sub={`${kpis.total_conversations} totales`} color="blue" />
        <KpiCard icon={Bot} label="Resueltas por IA" value={`${kpis.ai_resolution_rate}%`} sub="Sin intervención humana" color="purple" />
        <KpiCard icon={Clock} label="Tiempo de respuesta" value={kpis.avg_response_time} sub="Promedio hoy" color="green" />
        <KpiCard icon={Zap} label="Atención humana" value={kpis.human_takeover} sub="Conversaciones activas" color="amber" />
        <KpiCard icon={TrendingUp} label="Leads nuevos" value={kpis.new_leads} sub="Esta semana" color="indigo" />
        <KpiCard icon={MessageSquare} label="Mensajes hoy" value={kpis.messages_today} sub="Todos los canales" color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Channels */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Conversaciones por canal</h2>
          <div className="space-y-4">
            {kpis.channels.map(c => (
              <ChannelBar key={c.name} {...c} total={totalConv} />
            ))}
          </div>
        </div>

        {/* Leads pipeline */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline de leads</h2>
          <div className="space-y-3">
            {stages.map(s => (
              <LeadStage key={s.key} label={s.label} count={kpis.leads_by_stage[s.key]} color={s.color} />
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">Total leads</span>
            <span className="font-bold text-gray-800">
              {Object.values(kpis.leads_by_stage).reduce((a, b) => a + b, 0)}
            </span>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
