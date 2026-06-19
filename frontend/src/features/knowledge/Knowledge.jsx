import PageShell from '../../components/layout/PageShell'
import { BookOpen, Construction } from 'lucide-react'

export default function Knowledge() {
  return (
    <PageShell title="Base de Conocimiento" subtitle="Documentos e información para el agente IA">
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <Construction size={40} className="text-gray-300" />
        <p className="text-sm font-medium">Módulo en construcción</p>
        <p className="text-xs text-gray-400">Aquí irán los documentos, FAQs y plantillas del agente IA</p>
      </div>
    </PageShell>
  )
}
