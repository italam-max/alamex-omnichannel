import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader, X, Trash2, Wrench, ClipboardList, Tag, MessageCircle,
  Webhook, ShieldCheck, AlertCircle, CheckCircle,
} from 'lucide-react'
import {
  listTools, createTool, updateTool, deleteTool, approveTool,
} from '../../services/knowledge'
import { confirm } from '../../store/confirm'
import { reportError } from '../../store/errors'

// Archetype catalog — what the user can build, and how risky it is.
const ARCHETYPES = {
  collect_data: {
    label: 'Capturar datos', icon: ClipboardList, color: 'var(--jade)',
    blurb: 'El agente recolecta campos del cliente y los registra (ej. agendar una visita).',
  },
  tag_route: {
    label: 'Etiquetar / enrutar', icon: Tag, color: 'var(--gold)',
    blurb: 'Etiqueta la conversación y, si quieres, la escala a un humano.',
  },
  canned_response: {
    label: 'Respuesta guiada', icon: MessageCircle, color: 'var(--ink-mid)',
    blurb: 'Devuelve un texto fijo cuando aplica (ej. política de envíos).',
  },
  webhook: {
    label: 'Webhook saliente', icon: Webhook, color: 'var(--crimson)',
    blurb: 'Envía los datos a tu sistema (CRM, Zapier). Requiere revisión antes de activarse.',
  },
}

const PARAM_TYPES = [
  { value: 'string', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'integer', label: 'Entero' },
  { value: 'boolean', label: 'Sí/No' },
]

const STATUS_BADGE = {
  draft:          { label: 'Borrador',   bg: 'var(--sand-2)',     fg: 'var(--text-mid)' },
  pending_review: { label: 'En revisión', bg: 'var(--gold-pale)',  fg: 'var(--gold)' },
  approved:       { label: 'Aprobada',   bg: 'var(--jade-pale)',  fg: 'var(--jade)' },
}

function emptyForm(archetype) {
  return {
    name: '', display_name: '', description: '', archetype,
    parameters: [], config: {}, is_active: false,
  }
}

// ── Tool card ─────────────────────────────────────────────────────

function ToolCard({ tool, onEdit, onDelete, onToggle, onApprove }) {
  const arch = ARCHETYPES[tool.archetype] || ARCHETYPES.collect_data
  const Icon = arch.icon
  const status = STATUS_BADGE[tool.review_status] || STATUS_BADGE.draft
  const canActivate = !tool.needs_review || tool.review_status === 'approved'

  return (
    <div className="kb-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div className="kb-icon-tile" style={{ background: 'var(--gold-pale)' }}>
          <Icon size={15} style={{ color: arch.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="kb-tag">{tool.name}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{arch.label}</span>
            {tool.needs_review && (
              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: status.bg, color: status.fg }}>
                {status.label}
              </span>
            )}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-mid)', margin: '6px 0 0', lineHeight: 1.45 }}>{tool.description}</p>
          {tool.run_count > 0 && (
            <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{tool.run_count} ejecuci{tool.run_count === 1 ? 'ón' : 'ones'}</p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Active toggle */}
          <button
            onClick={() => onToggle(tool)}
            disabled={!canActivate && !tool.is_active}
            title={canActivate ? (tool.is_active ? 'Desactivar' : 'Activar') : 'Requiere aprobación'}
            className="ai-toggle"
            style={{ opacity: (!canActivate && !tool.is_active) ? 0.4 : 1 }}>
            <span className={`ai-toggle-track ${tool.is_active ? 'on' : 'off'}`}>
              <span className="ai-toggle-thumb" />
            </span>
          </button>
          <button onClick={() => onEdit(tool)} style={{ fontSize: '12px', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
          <button onClick={() => onDelete(tool)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--crimson)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {tool.needs_review && tool.review_status === 'pending_review' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '10px', padding: '8px 12px', background: 'var(--gold-pale)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-mid)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={13} style={{ color: 'var(--gold)' }} /> Webhook en revisión del operador
          </span>
          <button onClick={() => onApprove(tool)} className="btn-gold" style={{ padding: '4px 10px', fontSize: '11px' }}>Aprobar</button>
        </div>
      )}
    </div>
  )
}

// ── Parameter builder ─────────────────────────────────────────────

function ParamBuilder({ params, onChange }) {
  const set = (i, key, val) => {
    const next = params.map((p, idx) => idx === i ? { ...p, [key]: val } : p)
    onChange(next)
  }
  const add = () => onChange([...params, { name: '', type: 'string', required: true, description: '' }])
  const remove = (i) => onChange(params.filter((_, idx) => idx !== i))

  return (
    <div>
      <label className="kb-label">Parámetros que el agente recolecta</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {params.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input value={p.name} onChange={e => set(i, 'name', e.target.value.toLowerCase())}
              placeholder="nombre_campo" className="kb-input kb-mono" style={{ flex: '0 0 150px' }} />
            <select value={p.type} onChange={e => set(i, 'type', e.target.value)} className="kb-select" style={{ flex: '0 0 100px' }}>
              {PARAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={p.description || ''} onChange={e => set(i, 'description', e.target.value)}
              placeholder="¿Qué es este campo?" className="kb-input" style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', paddingTop: '9px', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={!!p.required} onChange={e => set(i, 'required', e.target.checked)} className="kb-check" /> Req.
            </label>
            <button onClick={() => remove(i)} style={{ paddingTop: '9px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 0' }}>
        <Plus size={13} /> Agregar parámetro
      </button>
    </div>
  )
}

// ── Create / edit modal ───────────────────────────────────────────

function ToolModal({ initial, onClose, onSaved }) {
  const [step, setStep]   = useState(initial.id ? 'form' : 'archetype')
  const [form, setForm]   = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const arch = ARCHETYPES[form.archetype] || ARCHETYPES.collect_data
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setConfig = (key, val) => setForm(f => ({ ...f, config: { ...f.config, [key]: val } }))

  const pickArchetype = (key) => { setForm(f => ({ ...emptyForm(key), name: f.name, display_name: f.display_name, description: f.description })); setStep('form') }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const payload = {
        name: form.name.trim(), display_name: form.display_name.trim(),
        description: form.description.trim(), archetype: form.archetype,
        parameters: form.parameters, config: form.config, is_active: form.is_active,
      }
      const saved = form.id ? await updateTool(form.id, payload) : await createTool(payload)
      onSaved(saved)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' · ') : (d || 'Error al guardar'))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="kb-card" style={{ width: '100%', maxWidth: '640px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(11,23,40,0.25)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            {form.id ? 'Editar herramienta' : 'Nueva herramienta'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          {step === 'archetype' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {Object.entries(ARCHETYPES).map(([key, a]) => {
                const Icon = a.icon
                return (
                  <button key={key} onClick={() => pickArchetype(key)} className="kb-card"
                    style={{ padding: '14px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon size={16} style={{ color: a.color }} />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{a.label}</span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>{a.blurb}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <arch.icon size={14} style={{ color: arch.color }} />
                {arch.label}
                {!form.id && (
                  <button onClick={() => setStep('archetype')} style={{ fontSize: '11px', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>Cambiar tipo</button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="kb-label">Nombre (snake_case)</label>
                  <input value={form.name} onChange={e => set('name', e.target.value.toLowerCase())} placeholder="agendar_visita" className="kb-input kb-mono" disabled={!!form.id} />
                  <p className="kb-hint">Identificador que ve el agente. No se puede cambiar luego.</p>
                </div>
                <div>
                  <label className="kb-label">Nombre visible</label>
                  <input value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Agendar visita" className="kb-input" />
                </div>
              </div>

              <div>
                <label className="kb-label">¿Cuándo debe usarla el agente?</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
                  placeholder="Ej. Cuando el cliente quiere que un técnico revise su equipo en sitio." className="kb-textarea" />
                <p className="kb-hint">Esta instrucción es la que el agente lee para decidir cuándo llamarla.</p>
              </div>

              {/* Per-archetype config */}
              {(form.archetype === 'collect_data' || form.archetype === 'webhook') && (
                <ParamBuilder params={form.parameters} onChange={v => set('parameters', v)} />
              )}

              {form.archetype === 'tag_route' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="kb-label">Etiqueta</label>
                    <input value={form.config.tag || ''} onChange={e => setConfig('tag', e.target.value)} placeholder="legal" className="kb-input" />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.config.escalate} onChange={e => setConfig('escalate', e.target.checked)} className="kb-check" />
                    <span style={{ fontSize: '12px', color: 'var(--text-mid)' }}>Escalar a un agente humano al usarse</span>
                  </label>
                </div>
              )}

              {form.archetype === 'canned_response' && (
                <div>
                  <label className="kb-label">Texto de respuesta</label>
                  <textarea value={form.config.text || ''} onChange={e => setConfig('text', e.target.value)} rows={3}
                    placeholder="Enviamos a todo el país en 3-5 días hábiles…" className="kb-textarea" />
                </div>
              )}

              {form.archetype === 'webhook' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '12px' }}>
                    <div>
                      <label className="kb-label">URL del webhook (HTTPS)</label>
                      <input value={form.config.url || ''} onChange={e => setConfig('url', e.target.value)} placeholder="https://hooks.tu-crm.com/lead" className="kb-input kb-mono" />
                    </div>
                    <div>
                      <label className="kb-label">Método</label>
                      <select value={form.config.method || 'POST'} onChange={e => setConfig('method', e.target.value)} className="kb-select">
                        <option>POST</option><option>PUT</option><option>GET</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--gold-pale)', borderRadius: '8px', fontSize: '11.5px', color: 'var(--text-mid)', lineHeight: 1.45 }}>
                    <ShieldCheck size={14} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }} />
                    Por seguridad, los webhooks pasan por revisión del operador antes de activarse. Solo HTTPS, sin direcciones internas, con cobro por ejecución.
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} className="kb-check" />
                <span style={{ fontSize: '12px', color: 'var(--text-mid)' }}>Activar al guardar {form.archetype === 'webhook' && '(tras aprobación)'}</span>
              </label>

              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--crimson-pale)', borderRadius: '8px', fontSize: '12px', color: 'var(--crimson)' }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {step === 'form' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={onClose} style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.description.trim()} className="btn-gold">
              {saving ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />} Guardar herramienta
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────

export default function CustomTools() {
  const [tools, setTools]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // tool object or {} for new

  const load = useCallback(async () => {
    setLoading(true)
    try { setTools(await listTools()) } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const handleSaved = (saved) => {
    setTools(ts => {
      const exists = ts.some(t => t.id === saved.id)
      return exists ? ts.map(t => t.id === saved.id ? saved : t) : [...ts, saved]
    })
    setEditing(null)
  }
  const handleDelete = async (tool) => {
    const ok = await confirm({
      title: 'Eliminar herramienta',
      message: `¿Eliminar la herramienta "${tool.name}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar', danger: true,
    })
    if (!ok) return
    try {
      await deleteTool(tool.id)
      setTools(ts => ts.filter(t => t.id !== tool.id))
    } catch (e) { reportError(e, 'Eliminar herramienta') }
  }
  const handleToggle = async (tool) => {
    try {
      const updated = await updateTool(tool.id, { is_active: !tool.is_active })
      setTools(ts => ts.map(t => t.id === tool.id ? updated : t))
    } catch (e) { reportError(e, 'Activar/desactivar herramienta') }
  }
  const handleApprove = async (tool) => {
    try {
      const updated = await approveTool(tool.id)
      setTools(ts => ts.map(t => t.id === tool.id ? updated : t))
    } catch (e) { reportError(e, 'Aprobar herramienta') }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          {tools.length} herramienta{tools.length !== 1 ? 's' : ''} personalizada{tools.length !== 1 ? 's' : ''}
        </p>
        <button onClick={() => setEditing(emptyForm('collect_data'))} className="btn-outline">
          <Plus size={12} /> Crear herramienta
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <Loader size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : tools.length === 0 ? (
        <div className="kb-card" style={{ padding: '28px', textAlign: 'center', borderStyle: 'dashed' }}>
          <Wrench size={26} style={{ color: 'var(--border)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Sin herramientas personalizadas</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0', opacity: 0.7 }}>Crea una para que el agente haga más que conversar</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tools.map(tool => (
            <ToolCard key={tool.id} tool={tool}
              onEdit={setEditing} onDelete={handleDelete} onToggle={handleToggle} onApprove={handleApprove} />
          ))}
        </div>
      )}

      {editing && (
        <ToolModal initial={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
