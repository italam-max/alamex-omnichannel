import PageShell from '../../components/layout/PageShell'
import { Construction } from 'lucide-react'

export default function Integrations() {
  return (
    <PageShell title="Integraciones" subtitle="Conexiones con Odoo, Evolution API y otros servicios">
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <Construction size={40} className="text-gray-300" />
        <p className="text-sm font-medium">Módulo en construcción</p>
        <p className="text-xs text-gray-400">Aquí se configurarán las integraciones con sistemas externos</p>
      </div>
    </PageShell>
  )
}
