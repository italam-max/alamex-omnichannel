import { mockLeads } from '../../mocks/kpis'
import PageShell from '../../components/layout/PageShell'
import { DollarSign } from 'lucide-react'

const stages = [
  { key: 'new', label: 'Nuevo', color: 'bg-slate-100 text-slate-600', header: 'bg-slate-500' },
  { key: 'contacted', label: 'Contactado', color: 'bg-blue-100 text-blue-700', header: 'bg-blue-500' },
  { key: 'qualified', label: 'Calificado', color: 'bg-purple-100 text-purple-700', header: 'bg-purple-500' },
  { key: 'proposal', label: 'Propuesta', color: 'bg-amber-100 text-amber-700', header: 'bg-amber-500' },
  { key: 'closed', label: 'Cerrado', color: 'bg-emerald-100 text-emerald-700', header: 'bg-emerald-500' },
]

function LeadCard({ lead }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
      <p className="text-sm font-semibold text-gray-800 mb-1">{lead.contact.name}</p>
      {lead.value && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <DollarSign size={11} />
          <span>${lead.value.toLocaleString('es-MX')}</span>
        </div>
      )}
      {lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lead.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
              {tag}
            </span>
          ))}
        </div>
      )}
      {lead.owner && (
        <p className="text-[11px] text-gray-400 mt-2">· {lead.owner}</p>
      )}
    </div>
  )
}

export default function Leads() {
  return (
    <PageShell title="Pipeline de Leads" subtitle="Gestión y seguimiento de oportunidades">
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {stages.map(stage => {
          const leads = mockLeads.filter(l => l.stage === stage.key)
          return (
            <div key={stage.key} className="flex-shrink-0 w-64 flex flex-col">
              <div className={`${stage.header} rounded-t-lg px-3 py-2 flex items-center justify-between`}>
                <span className="text-white text-xs font-semibold">{stage.label}</span>
                <span className="bg-white/20 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {leads.length}
                </span>
              </div>
              <div className="flex-1 bg-gray-50 rounded-b-lg border border-gray-200 border-t-0 p-2 space-y-2 min-h-48">
                {leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
              </div>
            </div>
          )
        })}
      </div>
    </PageShell>
  )
}
