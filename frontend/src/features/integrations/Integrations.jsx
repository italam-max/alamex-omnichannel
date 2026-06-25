import { useState, useEffect } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  CheckCircle, XCircle, MessageSquare,
  Settings, Eye, EyeOff, Loader, Plus, ToggleLeft, ToggleRight, Trash2, RefreshCw, Bot
} from 'lucide-react'
import { listChannels, createChannel, updateChannel, deleteChannel, testChannel } from '../../services/channels'
import { confirm } from '../../store/confirm'
import { reportError } from '../../store/errors'

const WEBHOOK_URL = `${window.location.protocol}//${window.location.hostname}:8000/api/integrations/webhook/meta/`

// ── Field definitions per channel type ───────────────────────────

const AI_FIELDS = [
  { divider: true, label: 'Agente IA' },
  { key: 'ai_enabled',           label: 'Activar agente IA',        boolean: true,  help: 'El asistente responde automáticamente · API key configurada en Ajustes' },
  { key: 'ai_model',             label: 'Modelo',                   select: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'], help: 'Haiku: rápido y económico · Sonnet: equilibrado · Opus: más capaz' },
  { key: 'ai_context_messages',  label: 'Mensajes de contexto',     placeholder: '10', help: 'Cuántos mensajes anteriores incluir (1–50, default 10)' },
  { key: 'ai_handoff_keywords',  label: 'Palabras clave de traspaso', placeholder: 'agente, humano, persona, ayuda', help: 'Si el usuario escribe estas palabras se transfiere a un agente (separadas por coma)' },
]

const CHANNEL_FIELDS = {
  whatsapp: [
    { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '1119808294554235', secret: false, help: 'Meta → tu App → WhatsApp → API Setup (Step 1)' },
    { key: 'meta_app_id',     label: 'Meta App ID',     placeholder: '1345579844136949', secret: false, help: 'Meta → tu App → App settings → Basic' },
    { key: 'access_token',    label: 'Access Token',    placeholder: 'EAAxxxxxxx',       secret: true,  help: 'Business settings → System users → Generate token' },
    { key: 'app_secret',      label: 'App Secret',      placeholder: 'd032571146...',    secret: true,  help: 'Meta → tu App → App settings → Basic → App secret' },
    { key: 'verify_token',    label: 'Verify Token',    placeholder: 'tu-token-secreto', secret: true,  help: 'Palabra clave que tú eliges — la misma que en Meta Webhooks' },
    ...AI_FIELDS,
  ],
  messenger: [
    { key: 'page_id',            label: 'Facebook Page ID',    placeholder: '409937795710821', secret: false, help: 'Tu Página → About, o Meta Business Suite → Settings' },
    { key: 'meta_app_id',        label: 'Meta App ID',         placeholder: '27291667697185733', secret: false, help: 'Meta → tu App → App settings → Basic' },
    { key: 'page_access_token',  label: 'Page Access Token',   placeholder: 'EAADxxxxx',       secret: true,  help: 'App → Messenger → API settings → Generate token' },
    { key: 'app_secret',         label: 'App Secret',          placeholder: '2601f354...',      secret: true,  help: 'Meta → tu App → App settings → Basic → App secret' },
    { key: 'verify_token',       label: 'Verify Token',        placeholder: 'tu-token-secreto', secret: true,  help: 'Palabra clave que tú eliges' },
    ...AI_FIELDS,
  ],
  instagram: [
    { key: 'instagram_account_id', label: 'Instagram Account ID', placeholder: '17841408067010982', secret: false, help: 'Meta Business settings → Linked accounts, o Graph API' },
    { key: 'meta_app_id',          label: 'Meta App ID',          placeholder: '1028723836244861', secret: false, help: 'Meta → tu App → App settings → Basic' },
    { key: 'access_token',         label: 'Access Token',         placeholder: 'IGAANxxxxx',        secret: true,  help: 'App → Instagram → API setup → Generate token' },
    ...AI_FIELDS,
  ],
  website: [
    { key: 'widget_key',        label: 'Widget Key (auto)',     placeholder: 'web_xxxx',              secret: false, readonly: true, help: 'Generado automáticamente — pégalo en tu sitio web' },
    { key: 'allowed_origins',   label: 'Dominios permitidos',  placeholder: 'https://www.alam.mx',   secret: false, textarea: true, help: 'Un dominio por línea. Ej: https://www.alam.mx' },
    { key: 'header_title',      label: 'Título del chat',      placeholder: 'Chatea con nosotros',   secret: false, help: 'Texto que aparece en la cabecera del widget' },
    { key: 'accent_color',      label: 'Color de acento',      placeholder: '#e7a518',               secret: false, color: true, help: 'Color principal del botón y cabecera' },
    { key: 'greeting_message',  label: 'Mensaje de bienvenida',placeholder: '¡Hola! ¿En qué puedo ayudarte?', secret: false, textarea: true, help: 'Primer mensaje que ve el visitante' },
    { key: 'launcher_position', label: 'Posición del botón',   placeholder: 'bottom-right',          secret: false, select: ['bottom-right', 'bottom-left'], help: 'Esquina donde aparece el botón flotante' },
    ...AI_FIELDS,
  ],
}

const CHANNEL_META = {
  whatsapp:  { label: 'WhatsApp',       color: 'green',  dot: '#25D366' },
  messenger: { label: 'Messenger',      color: 'blue',   dot: '#0084FF' },
  instagram: { label: 'Instagram',      color: 'pink',   dot: '#E1306C' },
  website:   { label: 'Website Widget', color: 'amber',  dot: 'var(--gold)' },
}


// ── Secret field with toggle visibility ───────────────────────────

function SecretInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false)
  const isMasked = value === '••••••••'
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show && !isMasked ? 'text' : 'password'}
        value={isMasked ? '' : value}
        onChange={e => onChange(e.target.value)}
        placeholder={isMasked ? '(guardado — dejar vacío para no cambiar)' : placeholder}
        disabled={disabled}
        className="kb-input kb-mono"
        style={{ paddingRight: '36px' }}
      />
      {!isMasked && (
        <button type="button" onClick={() => setShow(s => !s)}
          aria-label={show ? 'Ocultar valor' : 'Mostrar valor'}
          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
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
    if (!channel.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testChannel(channel.id)
      setTestResult(result)
    } catch (e) {
      setTestResult({ ok: false, detail: e.response?.data?.detail || 'Error de conexión' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="kb-card" style={{ width: '100%', maxWidth: '512px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(11,23,40,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Configurar canal</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{CHANNEL_META[channel.type]?.label}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div className="space-y-4" style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
          {/* Channel name */}
          <div>
            <label className="kb-label">Nombre del canal</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="kb-input"
              placeholder="Ej. WhatsApp Principal"
            />
          </div>

          {/* Webhook URL (read-only) */}
          <div>
            <label className="kb-label">Webhook URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(pegar en Meta)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sand)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
              <code style={{ fontSize: '12px', color: 'var(--text-mid)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{WEBHOOK_URL}</code>
              <button onClick={() => navigator.clipboard.writeText(WEBHOOK_URL)}
                style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: 600, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}>Copiar</button>
            </div>
          </div>

          {/* Embed snippet for website widget */}
          {channel.type === 'website' && creds.widget_key && (
            <div>
              <label className="kb-label">Código para tu sitio web</label>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'var(--ink)', borderRadius: '8px', padding: '10px 12px' }}>
                <code style={{ fontSize: '12px', color: 'var(--gold-light)', flex: 1, wordBreak: 'break-all' }}>
                  {`<script src="${window.location.protocol}//${window.location.hostname}:8000/widget.js" data-key="${creds.widget_key}" defer></script>`}
                </code>
                <button onClick={() => navigator.clipboard.writeText(`<script src="${window.location.protocol}//${window.location.hostname}:8000/widget.js" data-key="${creds.widget_key}" defer></script>`)}
                  style={{ fontSize: '11px', color: 'var(--gold-light)', fontWeight: 600, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}>Copiar</button>
              </div>
              <p className="kb-hint">Pega este código antes de <code style={{ background: 'var(--sand-2)', padding: '0 4px', borderRadius: '4px' }}>&lt;/body&gt;</code> en tu sitio web.</p>
            </div>
          )}

          {/* Credential fields */}
          <div className="space-y-3">
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              {channel.type === 'website' ? 'Configuración' : 'Credenciales'}
            </p>
            {fields.map((f, i) => {
              if (f.divider) return (
                <div key={`divider-${i}`} style={{ paddingTop: '12px' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Bot size={13} style={{ color: 'var(--gold)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>
                  <div style={{
                    display: 'flex', gap: '8px', padding: '8px 12px',
                    background: 'var(--gold-vp)', borderLeft: '3px solid var(--gold)',
                    borderRadius: '0 6px 6px 0', marginBottom: '12px',
                    fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5,
                  }}>
                    <span>⚡</span>
                    <span>
                      El agente usa <strong style={{ color: 'var(--text-mid)' }}>LangGraph ReAct</strong> — razona antes de actuar. La personalidad y reglas se configuran en <strong style={{ color: 'var(--text-mid)' }}>Conocimiento</strong>; aquí controlas el modelo y el traspaso.
                    </span>
                  </div>
                </div>
              )
              if (f.boolean) return (
                <div key={f.key} className="flex items-center justify-between py-1">
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-mid)' }}>{f.label}</span>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{f.help}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreds(c => ({ ...c, [f.key]: !c[f.key] }))}
                    aria-label={creds[f.key] ? `Desactivar ${f.label}` : `Activar ${f.label}`}
                    className="flex-shrink-0"
                    style={{ color: creds[f.key] ? 'var(--gold)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', transition: 'color 0.15s' }}
                  >
                    {creds[f.key] ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              )
              return (
                <div key={f.key}>
                  <label className="kb-label">{f.label}</label>
                  {f.secret ? (
                    <SecretInput
                      value={creds[f.key] || ''}
                      onChange={v => setCreds(c => ({ ...c, [f.key]: v }))}
                      placeholder={f.placeholder}
                    />
                  ) : f.textarea ? (
                    <textarea
                      value={creds[f.key] || ''}
                      onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={3}
                      className="kb-textarea"
                      style={{ resize: 'none' }}
                    />
                  ) : f.color ? (
                    <div className="flex items-center gap-2">
                      <input type="color" value={creds[f.key] || '#e7a518'}
                        onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                        style={{ width: '40px', height: '36px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', padding: '2px' }} />
                      <input value={creds[f.key] || '#e7a518'}
                        onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="kb-input kb-mono"
                        style={{ flex: 1 }} />
                    </div>
                  ) : f.select ? (
                    <select value={creds[f.key] || f.select[0]}
                      onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                      className="kb-select">
                      {f.select.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : f.readonly ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--sand)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
                      <code style={{ fontSize: '12px', color: 'var(--text-mid)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creds[f.key] || '(se generará al guardar)'}</code>
                      {creds[f.key] && <button onClick={() => navigator.clipboard.writeText(creds[f.key])}
                        style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: 600, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}>Copiar</button>}
                    </div>
                  ) : (
                    <input
                      value={creds[f.key] || ''}
                      onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="kb-input kb-mono"
                    />
                  )}
                  <p className="kb-hint">{f.help}</p>
                </div>
              )
            })}
          </div>

          {/* Test result */}
          {testResult && (
            <div className="flex items-center gap-2"
              style={{
                padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                background: testResult.ok ? 'var(--jade-pale)' : 'var(--crimson-pale)',
                color: testResult.ok ? 'var(--jade)' : 'var(--crimson)',
              }}>
              {testResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {testResult.detail}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-outline"
          >
            {testing ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            Probar conexión
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
            <button
              onClick={() => onSave({ ...channel, name, credentials: creds })}
              className="btn-gold"
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
  const filledCount = fields.filter(f => f.key && !f.boolean && (channel.credentials || {})[f.key]).length

  return (
    <div className="card-warm transition-all" style={{ padding: '20px', opacity: channel.is_active ? 1 : 0.6 }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex-shrink-0" style={{ width: '10px', height: '10px', borderRadius: '99px', background: channel.is_active ? meta.dot : 'var(--text-muted)' }} />
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{channel.name}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onToggle(channel)} title={channel.is_active ? 'Desactivar' : 'Activar'}
            aria-label={channel.is_active ? 'Desactivar canal' : 'Activar canal'}
            style={{ padding: '6px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: channel.is_active ? 'var(--gold)' : 'var(--text-muted)' }}>
            {channel.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          </button>
          <button onClick={() => onEdit(channel)} title="Configurar"
            aria-label="Configurar canal"
            style={{ padding: '6px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)' }}>
            <Settings size={15} />
          </button>
          <button onClick={() => onDelete(channel)} title="Eliminar"
            aria-label="Eliminar canal"
            style={{ padding: '6px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)' }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>Configuración</span>
          <span>{filledCount}/{fields.length} campos</span>
        </div>
        <div style={{ height: '6px', background: 'var(--sand-2)', borderRadius: '99px', overflow: 'hidden' }}>
          <div className="transition-all"
            style={{ height: '100%', borderRadius: '99px', background: filledCount === fields.length ? 'var(--jade)' : 'var(--gold)', width: `${(filledCount / fields.length) * 100}%` }} />
        </div>
      </div>

      {/* Credential field list */}
      <div className="space-y-1">
        {fields.map(f => {
          const val = (channel.credentials || {})[f.key]
          return (
            <div key={f.key} className="flex items-center gap-2" style={{ fontSize: '11px' }}>
              {val
                ? <CheckCircle size={11} className="flex-shrink-0" style={{ color: 'var(--jade)' }} />
                : <XCircle size={11} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />}
              <span style={{ color: val ? 'var(--text-mid)' : 'var(--text-muted)' }}>{f.label}</span>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="kb-card" style={{ width: '100%', maxWidth: '384px', padding: '24px', boxShadow: '0 20px 60px rgba(11,23,40,0.25)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>Agregar canal</h2>
        <div className="space-y-3 mb-5">
          <div>
            <label className="kb-label">Tipo de canal</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="kb-select">
              <option value="whatsapp">WhatsApp</option>
              <option value="messenger">Messenger</option>
              <option value="instagram">Instagram</option>
              <option value="website">Website Widget</option>
            </select>
          </div>
          <div>
            <label className="kb-label">Nombre del canal</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. WhatsApp Principal"
              className="kb-input" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
          <button disabled={!name.trim()} onClick={() => onAdd({ type, name: name.trim() })}
            className="btn-gold">
            Crear
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Integrations() {
  const [channels, setChannels] = useState([])
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')

  const load = async () => {
    setLoading(true)
    setApiError('')
    try {
      const data = await listChannels()
      setChannels(data)
    } catch {
      setApiError('No se pudo cargar los canales del servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Logs a trackable incident (code + history via ErrorCenter) and shows a
  // persistent inline note referencing the code. No auto-dismiss.
  const showError = (context, error) => {
    const code = reportError(error, context)
    setApiError(`${context} · código ${code}`)
  }

  const handleSave = async (updated) => {
    try {
      const saved = await updateChannel(updated.id, {
        name: updated.name,
        is_active: updated.is_active,
        credentials: updated.credentials,
      })
      setChannels(cs => cs.map(c => c.id === saved.id ? saved : c))
      setEditing(null)
    } catch (e) {
      showError('No se pudo guardar el canal', e)
    }
  }

  const handleAdd = async ({ type, name }) => {
    const defaultCreds = type === 'website'
      ? { accent_color: '#e7a518', header_title: 'Chatea con nosotros', launcher_position: 'bottom-right' }
      : {}
    try {
      const created = await createChannel({ name, type, is_active: false, credentials: defaultCreds })
      setChannels(cs => [...cs, created])
      setAdding(false)
      setEditing(created)
    } catch (e) {
      showError('No se pudo crear el canal', e)
    }
  }

  const handleToggle = async (ch) => {
    try {
      const updated = await updateChannel(ch.id, { is_active: !ch.is_active })
      setChannels(cs => cs.map(c => c.id === updated.id ? updated : c))
    } catch (e) {
      showError('No se pudo cambiar el estado del canal', e)
    }
  }

  const handleDelete = async (ch) => {
    const ok = await confirm({
      title: 'Eliminar canal',
      message: `¿Eliminar el canal "${ch.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar', danger: true,
    })
    if (!ok) return
    try {
      await deleteChannel(ch.id)
      setChannels(cs => cs.filter(c => c.id !== ch.id))
    } catch (e) {
      showError('No se pudo eliminar el canal', e)
    }
  }

  const active = channels.filter(c => c.is_active).length

  return (
    <PageShell title="Canales" subtitle="Configura tus conexiones con WhatsApp, Messenger e Instagram">
      {/* Stats bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4" style={{ fontSize: '14px', color: 'var(--text-mid)' }}>
          <span><strong style={{ color: 'var(--text)' }}>{channels.length}</strong> canales</span>
          <span><strong style={{ color: 'var(--jade)' }}>{active}</strong> activos</span>
          <button onClick={load} aria-label="Recargar canales"
            style={{ padding: '4px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-muted)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <button onClick={() => setAdding(true)}
          className="btn-gold">
          <Plus size={14} />
          Agregar canal
        </button>
      </div>

      {apiError && (
        <div className="mb-4" style={{ padding: '10px 16px', background: 'var(--crimson-pale)', border: '1px solid var(--crimson)', borderRadius: '8px', fontSize: '12px', color: 'var(--crimson)' }}>{apiError}</div>
      )}

      {/* Webhook info banner */}
      <div className="mb-5" style={{
        background: 'var(--gold-vp)', border: '1px solid rgba(192,155,58,0.3)',
        borderRadius: '12px', padding: '14px 16px',
        display: 'flex', alignItems: 'flex-start', gap: '12px',
      }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%',
          background: 'var(--gold-pale)', color: 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '2px',
        }}>i</div>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
            Un webhook para todos tus canales
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{
              fontSize: '11px', color: 'var(--text-mid)',
              background: 'var(--sand-2)', padding: '2px 8px', borderRadius: '4px',
            }}>{WEBHOOK_URL}</code>
            <button onClick={() => navigator.clipboard.writeText(WEBHOOK_URL)}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Copiar
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
            Registra esta URL en Meta para cada canal. El sistema identifica el canal por su{' '}
            <code style={{ background: 'var(--sand-2)', padding: '1px 4px', borderRadius: '3px' }}>verify_token</code> único.
          </p>
        </div>
      </div>

      {/* Channel grid */}
      {channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--text-muted)' }}>
          <MessageSquare size={36} style={{ color: 'var(--sand-2)' }} />
          <p style={{ fontSize: '14px', margin: 0 }}>Sin canales configurados</p>
          <button onClick={() => setAdding(true)}
            style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>+ Agregar el primero</button>
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
