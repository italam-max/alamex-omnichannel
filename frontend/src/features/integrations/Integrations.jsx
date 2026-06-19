import PageShell from '../../components/layout/PageShell'
import { CheckCircle, XCircle, ExternalLink, MessageSquare } from 'lucide-react'

const WEBHOOK_BASE = 'http://192.168.10.119:8000/api/integrations/webhook/meta/'

const channels = [
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current text-green-500">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    color: 'green',
    description: 'WhatsApp Business Cloud API',
    webhook_url: WEBHOOK_BASE,
    env_vars: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
    meta_url: 'https://developers.facebook.com/apps',
    status: 'configured',
    phone: '+52 1 55 3037 3524',
  },
  {
    key: 'messenger',
    name: 'Messenger',
    icon: () => <MessageSquare className="w-6 h-6 text-blue-500" />,
    color: 'blue',
    description: 'Facebook Messenger Platform',
    webhook_url: WEBHOOK_BASE,
    env_vars: ['MESSENGER_PAGE_ID', 'MESSENGER_PAGE_ACCESS_TOKEN', 'MESSENGER_APP_SECRET', 'MESSENGER_VERIFY_TOKEN'],
    meta_url: 'https://developers.facebook.com/apps',
    status: 'configured',
    phone: null,
  },
  {
    key: 'instagram',
    name: 'Instagram',
    icon: () => (
      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current text-pink-500">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
    color: 'pink',
    description: 'Instagram Messaging API',
    webhook_url: WEBHOOK_BASE,
    env_vars: ['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_VERIFY_TOKEN'],
    meta_url: 'https://developers.facebook.com/apps',
    status: 'configured',
    phone: null,
  },
]

const statusColors = {
  configured: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle, label: 'Configurado' },
  pending:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: XCircle,     label: 'Pendiente' },
  error:      { bg: 'bg-red-50',     text: 'text-red-700',     icon: XCircle,     label: 'Error' },
}

function ChannelCard({ channel }) {
  const s = statusColors[channel.status] ?? statusColors.pending
  const Icon = channel.icon
  const StatusIcon = s.icon

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
            <Icon />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{channel.name}</h3>
            <p className="text-xs text-gray-400">{channel.description}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
          <StatusIcon size={12} />
          {s.label}
        </span>
      </div>

      {channel.phone && (
        <p className="text-xs text-gray-500 mb-3">
          <span className="font-medium">Número:</span> {channel.phone}
        </p>
      )}

      {/* Webhook URL */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500 mb-1">Webhook URL</p>
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          <code className="text-xs text-gray-600 flex-1 truncate">{channel.webhook_url}</code>
          <button
            onClick={() => navigator.clipboard.writeText(channel.webhook_url)}
            className="text-[11px] text-blue-500 hover:text-blue-700 flex-shrink-0 font-medium"
          >
            Copiar
          </button>
        </div>
      </div>

      {/* Env vars */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Variables de entorno</p>
        <div className="space-y-1">
          {channel.env_vars.map(v => (
            <div key={v} className="flex items-center gap-2">
              <CheckCircle size={11} className="text-emerald-500 flex-shrink-0" />
              <code className="text-[11px] text-gray-500">{v}</code>
            </div>
          ))}
        </div>
      </div>

      <a
        href={channel.meta_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
      >
        <ExternalLink size={12} />
        Abrir Meta for Developers
      </a>
    </div>
  )
}

export default function Integrations() {
  return (
    <PageShell title="Canales" subtitle="Conexiones activas con Meta — WhatsApp, Messenger e Instagram">
      <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-blue-600 text-sm font-bold">i</span>
        </div>
        <div>
          <p className="text-sm font-medium text-blue-800 mb-0.5">Webhook único para los tres canales</p>
          <p className="text-xs text-blue-600">
            Todos los canales apuntan al mismo endpoint <code className="bg-blue-100 px-1 rounded">/api/integrations/webhook/meta/</code>.
            Meta enruta automáticamente por tipo de objeto en el payload.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {channels.map(ch => <ChannelCard key={ch.key} channel={ch} />)}
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Pasos para activar un canal nuevo</h3>
        <ol className="space-y-2 text-xs text-gray-500">
          <li className="flex gap-2"><span className="font-bold text-gray-700 flex-shrink-0">1.</span> Ir a Meta for Developers → tu App → WhatsApp / Messenger / Instagram → Configuration → Webhooks</li>
          <li className="flex gap-2"><span className="font-bold text-gray-700 flex-shrink-0">2.</span> Pegar la URL del webhook y el Verify Token correspondiente del archivo <code className="bg-gray-100 px-1 rounded">.env</code></li>
          <li className="flex gap-2"><span className="font-bold text-gray-700 flex-shrink-0">3.</span> Suscribirse al campo <code className="bg-gray-100 px-1 rounded">messages</code></li>
          <li className="flex gap-2"><span className="font-bold text-gray-700 flex-shrink-0">4.</span> Reiniciar el backend para que cargue las nuevas variables de entorno</li>
        </ol>
      </div>
    </PageShell>
  )
}
