import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  CheckCircle, XCircle, ExternalLink, MessageSquare,
  Settings, Eye, EyeOff, Loader, Plus, ToggleLeft, ToggleRight, Trash2
} from 'lucide-react'

const WEBHOOK_URL = `${window.location.protocol}//${window.location.hostname}:8000/api/integrations/webhook/meta/`

// ── Field definitions per channel type ───────────────────────────

const CHANNEL_FIELDS = {
  whatsapp: [
    { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '1119808294554235', secret: false, help: 'Meta → tu App → WhatsApp → API Setup (Step 1)' },
    { key: 'meta_app_id',     label: 'Meta App ID',     placeholder: '1345579844136949', secret: false, help: 'Meta → tu App → App settings → Basic' },
    { key: 'access_token',    label: 'Access Token',    placeholder: 'EAAxxxxxxx',       secret: true,  help: 'Business settings → System users → Generate token' },
    { key: 'app_secret',      label: 'App Secret',      placeholder: 'd032571146...',    secret: true,  help: 'Meta → tu App → App settings → Basic → App secret' },
    { key: 'verify_token',    label: 'Verify Token',    placeholder: 'tu-token-secreto', secret: true,  help: 'Palabra clave que tú eliges — la misma que en Meta Webhooks' },
  ],
  messenger: [
    { key: 'page_id',            label: 'Facebook Page ID',    placeholder: '409937795710821', secret: false, help: 'Tu Página → About, o Meta Business Suite → Settings' },
    { key: 'meta_app_id',        label: 'Meta App ID',         placeholder: '27291667697185733', secret: false, help: 'Meta → tu App → App settings → Basic' },
    { key: 'page_access_token',  label: 'Page Access Token',   placeholder: 'EAADxxxxx',       secret: true,  help: 'App → Messenger → API settings → Generate token' },
    { key: 'app_secret',         label: 'App Secret',          placeholder: '2601f354...',      secret: true,  help: 'Meta → tu App → App settings → Basic → App secret' },
    { key: 'verify_token',       label: 'Verify Token',        placeholder: 'tu-token-secreto', secret: true,  help: 'Palabra clave que tú eliges' },
  ],
  instagram: [
    { key: 'instagram_account_id', label: 'Instagram Account ID', placeholder: '17841408067010982', secret: false, help: 'Meta Business settings → Linked accounts, o Graph API' },
    { key: 'meta_app_id',          label: 'Meta App ID',          placeholder: '1028723836244861', secret: false, help: 'Meta → tu App → App settings → Basic' },
    { key: 'access_token',         label: 'Access Token',         placeholder: 'IGAANxxxxx',        secret: true,  help: 'App → Instagram → API setup → Generate token' },
    { key: 'app_secret',           label: 'App Secret',           placeholder: 'd085xxxxx',         secret: true,  help: 'Meta → tu App → App settings → Basic → App secret' },
    { key: 'verify_token',         label: 'Verify Token',         placeholder: 'tu-token-secreto',  secret: true,  help: 'Palabra clave que tú eliges' },
  ],
}

const CHANNEL_META = {
  whatsapp:  { label: 'WhatsApp',  color: 'green', dot: 'bg-green-500' },
  messenger: { label: 'Messenger', color: 'blue',  dot: 'bg-blue-500' },
  instagram: { label: 'Instagram', color: 'pink',  dot: 'bg-pink-500' },
}

// ── Mock state (replace with API calls when backend is live) ──────

const INITIAL_CHANNELS = [
  { id: 1, name: 'WhatsApp Principal', type: 'whatsapp',  is_active: true,  credentials: { phone_number_id: '1119808294554235', meta_app_id: '1345579844136949', access_token: '••••••••', app_secret: '••••••••', verify_token: '••••••••' } },
  { id: 2, name: 'Messenger Alamex',   type: 'messenger', is_active: true,  credentials: { page_id: '409937795710821', meta_app_id: '27291667697185733', page_access_token: '••••••••', app_secret: '••••••••', verify_token: '••••••••' } },
  { id: 3, name: 'Instagram Alamex',   type: 'instagram', is_active: false, credentials: { instagram_account_id: '17841408067010982', meta_app_id: '1028723836244861', access_token: '••••••••', app_secret: '••••••••', verify_token: '••••••••' } },
]

// ── Secret field with toggle visibility ───────────────────────────

function SecretInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false)
  const isMasked = value === '••••••••'
  return (
    <div className="relative">
      <input
        type={show && !isMasked ? 'text' : 'password'}
        value={isMasked ? '' : value}
        onChange={e => onChange(e.target.value)}
        placeholder={isMasked ? '(guardado — dejar vacío para no cambiar)' : placeholder}
        disabled={disabled}
        className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono disabled:bg-gray-50"
      />
      {!isMasked && (
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  )
}

// ── Channel configuration modal ───────────────────────────────────

function ChannelModal({ channel, onSave, onClose }) {
  const fields = CHANNEL_FIELDS[channel.type] || []
  const [name, setName] = useState(channel.name)
  const [creds, setCreds] = useState({ ...(channel.credentials || {}) })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    await new Promise(r => setTimeout(r, 1200)) // simulate API call
    setTestResult({ ok: true, detail: 'Conexión exitosa con Meta Graph API' })
    setTesting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Configurar canal</h2>
            <p className="text-xs text-gray-400 mt-0.5">{CHANNEL_META[channel.type]?.label}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Channel name */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del canal</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              placeholder="Ej. WhatsApp Principal"
            />
          </div>

          {/* Webhook URL (read-only) */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Webhook URL <span className="text-gray-400">(pegar en Meta)</span></label>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <code className="text-xs text-gray-600 flex-1 truncate">{WEBHOOK_URL}</code>
              <button onClick={() => navigator.clipboard.writeText(WEBHOOK_URL)}
                className="text-[11px] text-blue-500 hover:text-blue-700 font-medium flex-shrink-0">Copiar</button>
            </div>
          </div>

          {/* Credential fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credenciales</p>
            {fields.map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
                {f.secret ? (
                  <SecretInput
                    value={creds[f.key] || ''}
                    onChange={v => setCreds(c => ({ ...c, [f.key]: v }))}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <input
                    value={creds[f.key] || ''}
                    onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono"
                  />
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">{f.help}</p>
              </div>
            ))}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {testResult.detail}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 justify-between">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {testing ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            Probar conexión
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button
              onClick={() => onSave({ ...channel, name, credentials: creds })}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Channel card ──────────────────────────────────────────────────

function ChannelCard({ channel, onEdit, onToggle, onDelete }) {
  const meta = CHANNEL_META[channel.type] || {}
  const fields = CHANNEL_FIELDS[channel.type] || []
  const filledCount = fields.filter(f => (channel.credentials || {})[f.key]).length

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 transition-all ${channel.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${channel.is_active ? meta.dot : 'bg-gray-300'}`} />
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{channel.name}</h3>
            <p className="text-xs text-gray-400">{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onToggle(channel)} title={channel.is_active ? 'Desactivar' : 'Activar'}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            {channel.is_active ? <ToggleRight size={18} className="text-blue-500" /> : <ToggleLeft size={18} />}
          </button>
          <button onClick={() => onEdit(channel)} title="Configurar"
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            <Settings size={15} />
          </button>
          <button onClick={() => onDelete(channel)} title="Eliminar"
            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-300 hover:text-red-400">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>Configuración</span>
          <span>{filledCount}/{fields.length} campos</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${filledCount === fields.length ? 'bg-emerald-500' : 'bg-amber-400'}`}
            style={{ width: `${(filledCount / fields.length) * 100}%` }} />
        </div>
      </div>

      {/* Credential field list */}
      <div className="space-y-1">
        {fields.map(f => {
          const val = (channel.credentials || {})[f.key]
          return (
            <div key={f.key} className="flex items-center gap-2 text-[11px]">
              {val
                ? <CheckCircle size={11} className="text-emerald-500 flex-shrink-0" />
                : <XCircle size={11} className="text-gray-300 flex-shrink-0" />}
              <span className={val ? 'text-gray-500' : 'text-gray-300'}>{f.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Add channel modal ─────────────────────────────────────────────

function AddChannelModal({ onAdd, onClose }) {
  const [type, setType] = useState('whatsapp')
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Agregar canal</h2>
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo de canal</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
              <option value="whatsapp">WhatsApp</option>
              <option value="messenger">Messenger</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del canal</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. WhatsApp Principal"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs text-gray-500">Cancelar</button>
          <button disabled={!name.trim()} onClick={() => onAdd({ type, name: name.trim() })}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 transition-colors">
            Crear
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Integrations() {
  const [channels, setChannels] = useState(INITIAL_CHANNELS)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  let nextId = Math.max(...channels.map(c => c.id), 0) + 1

  const handleSave = (updated) => {
    setChannels(cs => cs.map(c => c.id === updated.id ? updated : c))
    setEditing(null)
  }

  const handleAdd = ({ type, name }) => {
    const newCh = { id: nextId++, name, type, is_active: false, credentials: {} }
    setChannels(cs => [...cs, newCh])
    setAdding(false)
    setEditing(newCh)
  }

  const handleToggle = (ch) => {
    setChannels(cs => cs.map(c => c.id === ch.id ? { ...c, is_active: !c.is_active } : c))
  }

  const handleDelete = (ch) => {
    if (!window.confirm(`¿Eliminar el canal "${ch.name}"?`)) return
    setChannels(cs => cs.filter(c => c.id !== ch.id))
  }

  const active = channels.filter(c => c.is_active).length

  return (
    <PageShell title="Canales" subtitle="Configura tus conexiones con WhatsApp, Messenger e Instagram">
      {/* Stats bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span><strong className="text-gray-800">{channels.length}</strong> canales</span>
          <span><strong className="text-emerald-600">{active}</strong> activos</span>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors">
          <Plus size={14} />
          Agregar canal
        </button>
      </div>

      {/* Webhook info banner */}
      <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-blue-600 text-xs font-bold">i</div>
        <div>
          <p className="text-sm font-medium text-blue-800 mb-0.5">Un webhook para todos tus canales</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{WEBHOOK_URL}</code>
            <button onClick={() => navigator.clipboard.writeText(WEBHOOK_URL)}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium">Copiar</button>
          </div>
          <p className="text-xs text-blue-500 mt-1">Registra esta misma URL en Meta para cada canal. El sistema identifica el canal por su <code className="bg-blue-100 px-1 rounded">verify_token</code> único.</p>
        </div>
      </div>

      {/* Channel grid */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
          <MessageSquare size={36} className="text-gray-200" />
          <p className="text-sm">Sin canales configurados</p>
          <button onClick={() => setAdding(true)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">+ Agregar el primero</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {channels.map(ch => (
            <ChannelCard key={ch.id} channel={ch}
              onEdit={setEditing} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Modals */}
      {editing && <ChannelModal channel={editing} onSave={handleSave} onClose={() => setEditing(null)} />}
      {adding  && <AddChannelModal onAdd={handleAdd} onClose={() => setAdding(false)} />}
    </PageShell>
  )
}
