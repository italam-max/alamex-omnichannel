import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  BookOpen, Bot, Globe, Plus, Trash2,
  FileText, Save, Loader, ChevronUp, ChevronDown,
  CheckCircle, XCircle, X
} from 'lucide-react'
import {
  getAIConfig, saveAIConfig,
  listDocs, createDoc, updateDoc, deleteDoc
} from '../../services/knowledge'

// ── Tabs ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'knowledge', label: 'Conocimiento', icon: BookOpen },
  { key: 'persona',   label: 'Persona y comportamiento', icon: Bot },
  { key: 'language',  label: 'Idioma', icon: Globe },
]

const TONE_PRESETS = [
  { value: '', label: 'Sin definir' },
  { value: 'formal, profesional y cortés', label: 'Formal' },
  { value: 'amigable, cálido y natural, ligeramente casual pero profesional, conciso', label: 'Amigable' },
  { value: 'casual, directo y conversacional', label: 'Casual' },
  { value: '__custom__', label: 'Personalizado…' },
]

const PRESET_VALUES = new Set(TONE_PRESETS.map(p => p.value).filter(v => v && v !== '__custom__'))

const GENDER_OPTIONS = [
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
  { value: 'neutral', label: 'Neutro' },
]

// ── Document card ─────────────────────────────────────────────────

function DocCard({ doc, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState(doc.content)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onEdit(doc.id, { title, content })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
    setTitle(doc.title)
    setContent(doc.content)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileText size={14} className="text-violet-400 flex-shrink-0" />
        {editing ? (
          <input
            className="flex-1 text-sm font-medium text-gray-800 border-b border-violet-300 focus:outline-none py-0.5"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-800">{doc.title}</span>
        )}
        <span className="text-[11px] text-gray-400 flex-shrink-0">Nota</span>
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600 transition-colors">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button onClick={() => onDelete(doc.id)} className="text-gray-300 hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-2">
          {editing ? (
            <>
              <textarea
                className="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none"
                rows={6}
                value={content}
                onChange={e => setContent(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancelar</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
                  Guardar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{doc.content}</p>
              <button onClick={() => setEditing(true)} className="text-xs text-violet-500 hover:text-violet-700 font-medium">Editar</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add note modal ────────────────────────────────────────────────

function AddNoteModal({ onClose, onSave }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), content: content.trim() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Nueva nota</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej. Productos, FAQ, Cobertura…"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Contenido</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Escribe o pega el contenido aquí…"
              rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-gray-500 px-4 py-2 hover:text-gray-700">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
            className="flex items-center gap-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}
            Agregar nota
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rule row ──────────────────────────────────────────────────────

function RuleRow({ rule, index, total, onChange, onRemove, onMove }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-col gap-0.5 pt-2 flex-shrink-0">
        <button onClick={() => onMove(index, -1)} disabled={index === 0}
          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors">
          <ChevronUp size={13} />
        </button>
        <button onClick={() => onMove(index, 1)} disabled={index === total - 1}
          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors">
          <ChevronDown size={13} />
        </button>
      </div>
      <span className="text-xs text-gray-400 pt-2.5 w-5 flex-shrink-0 text-right">{index + 1}.</span>
      <textarea
        value={rule}
        onChange={e => onChange(index, e.target.value)}
        rows={2}
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none"
      />
      <button onClick={() => onRemove(index)}
        className="pt-2 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Knowledge() {
  const [tab, setTab] = useState('knowledge')
  const [config, setConfig] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [showAddNote, setShowAddNote] = useState(false)
  const [isCustomTone, setIsCustomTone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfg, docList] = await Promise.all([getAIConfig(), listDocs()])
      setConfig(cfg)
      setDocs(Array.isArray(docList) ? docList : (docList.results || []))
      setIsCustomTone(!!cfg.tone && !PRESET_VALUES.has(cfg.tone))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      const saved = await saveAIConfig(config)
      setConfig(saved)
      setSaveStatus('ok')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  const setField = (key, value) => setConfig(c => ({ ...c, [key]: value }))

  const handleAddDoc = async (payload) => {
    const doc = await createDoc({ ...payload, order: docs.length })
    setDocs(d => [...d, doc])
  }

  const handleEditDoc = async (id, payload) => {
    const updated = await updateDoc(id, payload)
    setDocs(d => d.map(doc => doc.id === id ? updated : doc))
  }

  const handleDeleteDoc = async (id) => {
    await deleteDoc(id)
    setDocs(d => d.filter(doc => doc.id !== id))
  }

  const handleRuleChange = (i, val) => {
    const rules = [...(config.behavior_rules || [])]
    rules[i] = val
    setField('behavior_rules', rules)
  }

  const handleRuleRemove = (i) => {
    const rules = [...(config.behavior_rules || [])]
    rules.splice(i, 1)
    setField('behavior_rules', rules)
  }

  const handleRuleMove = (i, dir) => {
    const rules = [...(config.behavior_rules || [])]
    const j = i + dir
    if (j < 0 || j >= rules.length) return
    ;[rules[i], rules[j]] = [rules[j], rules[i]]
    setField('behavior_rules', rules)
  }

  const handleRuleAdd = () => setField('behavior_rules', [...(config.behavior_rules || []), ''])

  if (loading || !config) {
    return (
      <PageShell title="Conocimiento" subtitle="Persona, reglas y documentos del agente IA">
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader size={24} className="animate-spin" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell title="Conocimiento" subtitle="Persona, reglas y documentos del agente IA">
      {/* Tab bar + Save button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader size={13} className="animate-spin" />
            : saveStatus === 'ok' ? <CheckCircle size={13} />
            : saveStatus === 'error' ? <XCircle size={13} />
            : <Save size={13} />}
          {saveStatus === 'ok' ? 'Guardado' : saveStatus === 'error' ? 'Error al guardar' : 'Guardar'}
        </button>
      </div>

      {/* ── KNOWLEDGE TAB ─────────────────────────────────────────── */}
      {tab === 'knowledge' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Resumen del negocio</h3>
            <p className="text-xs text-gray-400 mb-3">
              Texto corto que el agente siempre ve primero — qué es la empresa, qué vende y el tono a usar.
            </p>
            <textarea
              value={config.overview || ''}
              onChange={e => setField('overview', e.target.value)}
              rows={6}
              placeholder="Ej. Alamex es una empresa global de elevadores con más de 50 años de experiencia…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Documentos de conocimiento</h3>
                <p className="text-xs text-gray-400">{docs.length} documento{docs.length !== 1 ? 's' : ''} — el agente los lee al responder</p>
              </div>
              <button
                onClick={() => setShowAddNote(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Plus size={12} />
                Agregar nota
              </button>
            </div>

            {docs.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
                <FileText size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin documentos todavía</p>
                <p className="text-xs text-gray-300 mt-1">Agrega notas con productos, precios, FAQs, plantillas de respuesta…</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => (
                  <DocCard key={doc.id} doc={doc} onDelete={handleDeleteDoc} onEdit={handleEditDoc} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PERSONA TAB ───────────────────────────────────────────── */}
      {tab === 'persona' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Persona</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del agente</label>
                <input
                  value={config.agent_name || ''}
                  onChange={e => setField('agent_name', e.target.value)}
                  placeholder="Anna"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">El nombre que el agente usa para sí mismo</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Género</label>
                <select
                  value={config.agent_gender || 'female'}
                  onChange={e => setField('agent_gender', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
                >
                  {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">Afecta pronombres en español</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Empresa</label>
              <input
                value={config.company_name || ''}
                onChange={e => setField('company_name', e.target.value)}
                placeholder="Alamex"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tono</label>
              <select
                value={isCustomTone ? '__custom__' : (config.tone || '')}
                onChange={e => {
                  if (e.target.value === '__custom__') {
                    setIsCustomTone(true)
                    setField('tone', '')
                  } else {
                    setIsCustomTone(false)
                    setField('tone', e.target.value)
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
              >
                {TONE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {isCustomTone && (
                <input
                  value={config.tone || ''}
                  onChange={e => setField('tone', e.target.value)}
                  placeholder="Ej. cálido, natural y conciso"
                  className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
                />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Línea de identidad</label>
              <textarea
                value={config.identity_line || ''}
                onChange={e => setField('identity_line', e.target.value)}
                rows={2}
                placeholder="Eres Anna, una persona real del equipo de atención al cliente de Alamex…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">La primera línea que define quién es el agente</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Descripción</label>
              <textarea
                value={config.agent_description || ''}
                onChange={e => setField('agent_description', e.target.value)}
                rows={4}
                placeholder="Descripción más larga de la personalidad del agente…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none"
              />
            </div>
          </div>

          {/* Behavior rules */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Reglas de comportamiento</h3>
              <p className="text-xs text-gray-400">Cada regla es una instrucción que el agente siempre sigue, en orden</p>
            </div>

            <div className="space-y-2">
              {(config.behavior_rules || []).map((rule, i) => (
                <RuleRow
                  key={i}
                  rule={rule}
                  index={i}
                  total={config.behavior_rules.length}
                  onChange={handleRuleChange}
                  onRemove={handleRuleRemove}
                  onMove={handleRuleMove}
                />
              ))}
            </div>

            <button
              onClick={handleRuleAdd}
              className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors"
            >
              <Plus size={13} />
              Agregar regla
            </button>
          </div>
        </div>
      )}

      {/* ── LANGUAGE TAB ──────────────────────────────────────────── */}
      {tab === 'language' && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Configuración de idioma</h3>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Política de idioma</label>
              <select
                value={config.language_policy || 'mirror'}
                onChange={e => setField('language_policy', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
              >
                <option value="mirror">Espejo del cliente — responde en el mismo idioma</option>
                <option value="fixed">Idioma fijo — usa siempre los idiomas soportados</option>
              </select>
              <p className="text-[11px] text-gray-400 mt-0.5">
                El idioma de la respuesta se detecta automáticamente del último mensaje del cliente
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Idiomas soportados</label>
              <input
                value={config.supported_languages || ''}
                onChange={e => setField('supported_languages', e.target.value)}
                placeholder="es, en, ar"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 font-mono"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">
                Códigos separados por coma. El idioma de reserva es español.
              </p>
            </div>
          </div>
        </div>
      )}

      {showAddNote && (
        <AddNoteModal
          onClose={() => setShowAddNote(false)}
          onSave={handleAddDoc}
        />
      )}
    </PageShell>
  )
}
