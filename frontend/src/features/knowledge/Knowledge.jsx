import { useState, useEffect, useCallback, useRef } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Globe, Plus, Trash2, FileText, Save, Loader,
  ChevronUp, ChevronDown, CheckCircle, XCircle, X,
  Bot, BookOpen, Languages, Sparkles, Link, RefreshCw,
  Eye, EyeOff, Check, AlertCircle
} from 'lucide-react'
import {
  getAIConfig, saveAIConfig,
  listDocs, createDoc, updateDoc, deleteDoc,
  scrapeWebsite,
} from '../../services/knowledge'

// ── Section anchor nav ────────────────────────────────────────────

const SECTIONS = [
  { id: 'scraper',   label: 'Extractor web',       icon: Globe },
  { id: 'overview',  label: 'Resumen del negocio',  icon: BookOpen },
  { id: 'docs',      label: 'Documentos',           icon: FileText },
  { id: 'persona',   label: 'Persona',              icon: Bot },
  { id: 'rules',     label: 'Reglas',               icon: Sparkles },
  { id: 'language',  label: 'Idioma',               icon: Languages },
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
  { value: 'male',   label: 'Masculino' },
  { value: 'neutral', label: 'Neutro' },
]

// ── Section header ────────────────────────────────────────────────

function SectionHeader({ id, icon: Icon, label, sub }) {
  return (
    <div id={id} className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-violet-500" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

// ── Web Scraper section ───────────────────────────────────────────

function ScraperSection({ hasStoredKey, onImport }) {
  const [url, setUrl]                 = useState('')
  const [apiKey, setApiKey]           = useState(hasStoredKey ? '••••••••' : '')
  const [showKey, setShowKey]         = useState(false)
  const [followLinks, setFollowLinks] = useState(true)
  const [maxPages, setMaxPages]       = useState(5)
  const [loading, setLoading]         = useState(false)
  const [step, setStep]               = useState('')
  const [result, setResult]           = useState(null)
  const [selected, setSelected]       = useState({})
  const [error, setError]             = useState('')

  const steps = [
    'Conectando con el sitio…',
    'Extrayendo contenido de las páginas…',
    'Analizando y estructurando la información…',
    'Organizando documentos de conocimiento…',
  ]
  const stepRef = useRef(0)
  const stepTimerRef = useRef(null)

  const startStepCycle = () => {
    stepRef.current = 0
    setStep(steps[0])
    stepTimerRef.current = setInterval(() => {
      stepRef.current = Math.min(stepRef.current + 1, steps.length - 1)
      setStep(steps[stepRef.current])
    }, 3500)
  }

  const stopStepCycle = () => {
    clearInterval(stepTimerRef.current)
    setStep('')
  }

  const handleScrape = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    setSelected({})
    startStepCycle()
    try {
      const data = await scrapeWebsite({
        url: url.trim(),
        follow_links: followLinks,
        max_pages: maxPages,
        api_key: apiKey,
      })
      stopStepCycle()
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
        const sel = {}
        data.documents.forEach((_, i) => { sel[i] = true })
        setSelected(sel)
      }
    } catch (e) {
      stopStepCycle()
      setError(e.response?.data?.error || 'Error al conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!result) return
    const toImport = result.documents.filter((_, i) => selected[i])
    await onImport(toImport)
    setResult(null)
    setSelected({})
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* URL + options */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">URL del sitio web</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-violet-400">
                <Link size={13} className="ml-3 text-gray-400 flex-shrink-0" />
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScrape()}
                  placeholder="https://www.alam.mx"
                  className="flex-1 px-2 py-2.5 text-sm focus:outline-none"
                />
              </div>
              <button
                onClick={handleScrape}
                disabled={loading || !url.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {loading ? <Loader size={13} className="animate-spin" /> : <Globe size={13} />}
                {loading ? 'Analizando…' : 'Extraer información'}
              </button>
            </div>
          </div>

          {/* Options row */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={followLinks}
                onChange={e => setFollowLinks(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-violet-500"
              />
              <span className="text-xs text-gray-600">Seguir enlaces internos</span>
            </label>

            {followLinks && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Máx. páginas:</span>
                <select
                  value={maxPages}
                  onChange={e => setMaxPages(Number(e.target.value))}
                  className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400"
                >
                  {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <Bot size={12} className="text-violet-400" />
              <span className="text-xs text-gray-400">Analizar con IA</span>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-api03-… (opcional)"
                  className="text-xs px-2 py-1.5 w-44 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="px-2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              {hasStoredKey && apiKey === '••••••••' && (
                <span className="text-[11px] text-emerald-500 flex items-center gap-1">
                  <Check size={11} /> guardada
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Loading step indicator */}
        {loading && step && (
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 rounded-lg">
            <Loader size={12} className="animate-spin text-violet-500 flex-shrink-0" />
            <span className="text-xs text-violet-600">{step}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-lg text-xs text-red-600">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Results header */}
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {result.ai_structured
                ? <Sparkles size={13} className="text-violet-400" />
                : <FileText size={13} className="text-gray-400" />}
              <span className="text-xs font-medium text-gray-700">
                {result.documents.length} documentos encontrados
              </span>
              <span className="text-[11px] text-gray-400">
                · {result.pages_scraped} página{result.pages_scraped !== 1 ? 's' : ''} analizadas
                {result.ai_structured && ' · estructurado con IA'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const allSelected = selectedCount === result.documents.length
                  const s = {}
                  result.documents.forEach((_, i) => { s[i] = !allSelected })
                  setSelected(s)
                }}
                className="text-[11px] text-gray-400 hover:text-gray-600"
              >
                {selectedCount === result.documents.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
              >
                <Plus size={11} />
                Importar {selectedCount > 0 ? `${selectedCount} seleccionado${selectedCount !== 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </div>

          {/* Document previews */}
          <div className="divide-y divide-gray-50">
            {result.documents.map((doc, i) => (
              <div key={i} className={`flex gap-3 px-5 py-3.5 transition-colors ${selected[i] ? 'bg-violet-50/30' : 'bg-white'}`}>
                <input
                  type="checkbox"
                  checked={!!selected[i]}
                  onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-violet-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{doc.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{doc.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Document card ─────────────────────────────────────────────────

function DocCard({ doc, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing]   = useState(false)
  const [title, setTitle]       = useState(doc.title)
  const [content, setContent]   = useState(doc.content)
  const [saving, setSaving]     = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try { await onEdit(doc.id, { title, content }); setEditing(false) }
    finally { setSaving(false) }
  }

  const cancelEdit = () => {
    setEditing(false); setTitle(doc.title); setContent(doc.content)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileText size={14} className="text-violet-400 flex-shrink-0" />
        {editing ? (
          <input className="flex-1 text-sm font-medium text-gray-800 border-b border-violet-300 focus:outline-none py-0.5"
            value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        ) : (
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">{doc.title}</span>
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
              <textarea className="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none"
                rows={6} value={content} onChange={e => setContent(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancelar</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                  {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
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
  const [title, setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try { await onSave({ title: title.trim(), content: content.trim() }); onClose() }
    finally { setSaving(false) }
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
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ej. Productos, FAQ, Cobertura…" autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Contenido</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="Escribe o pega el contenido aquí…" rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-gray-500 px-4 py-2 hover:text-gray-700">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}
            className="flex items-center gap-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
            {saving ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />} Agregar nota
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
      <textarea value={rule} onChange={e => onChange(index, e.target.value)} rows={2}
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none" />
      <button onClick={() => onRemove(index)} className="pt-2 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Sticky side nav ───────────────────────────────────────────────

function SideNav({ activeSection }) {
  return (
    <aside className="sticky top-4 w-44 flex-shrink-0 hidden lg:block">
      <nav className="space-y-0.5">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
              activeSection === s.id
                ? 'bg-violet-50 text-violet-600 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <s.icon size={13} />
            {s.label}
          </a>
        ))}
      </nav>
    </aside>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Knowledge() {
  const [config, setConfig]         = useState(null)
  const [docs, setDocs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [showAddNote, setShowAddNote] = useState(false)
  const [isCustomTone, setIsCustomTone] = useState(false)
  const [activeSection, setActiveSection] = useState('scraper')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfg, docData] = await Promise.all([getAIConfig(), listDocs()])
      setConfig(cfg)
      setDocs(Array.isArray(docData) ? docData : (docData.results || []))
      setIsCustomTone(!!cfg.tone && !PRESET_VALUES.has(cfg.tone))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Section spy via IntersectionObserver
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActiveSection(entry.target.id)
      }
    }, { rootMargin: '-30% 0px -60% 0px' })
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [loading])

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

  const setField = (key, val) => setConfig(c => ({ ...c, [key]: val }))

  // Docs
  const handleAddDoc = async (payload) => {
    const doc = await createDoc({ ...payload, order: docs.length })
    setDocs(d => [...d, doc])
  }
  const handleImportDocs = async (docsToImport) => {
    const created = []
    for (const d of docsToImport) {
      const doc = await createDoc({ title: d.title, content: d.content, order: docs.length + created.length })
      created.push(doc)
    }
    setDocs(d => [...d, ...created])
    document.getElementById('docs')?.scrollIntoView({ behavior: 'smooth' })
  }
  const handleEditDoc = async (id, payload) => {
    const updated = await updateDoc(id, payload)
    setDocs(d => d.map(doc => doc.id === id ? updated : doc))
  }
  const handleDeleteDoc = async (id) => {
    await deleteDoc(id)
    setDocs(d => d.filter(doc => doc.id !== id))
  }

  // Rules
  const handleRuleChange = (i, val) => {
    const rules = [...(config.behavior_rules || [])]; rules[i] = val; setField('behavior_rules', rules)
  }
  const handleRuleRemove = (i) => {
    const rules = [...(config.behavior_rules || [])]; rules.splice(i, 1); setField('behavior_rules', rules)
  }
  const handleRuleMove = (i, dir) => {
    const rules = [...(config.behavior_rules || [])]; const j = i + dir
    if (j < 0 || j >= rules.length) return
    ;[rules[i], rules[j]] = [rules[j], rules[i]]; setField('behavior_rules', rules)
  }
  const handleRuleAdd = () => setField('behavior_rules', [...(config.behavior_rules || []), ''])

  if (loading || !config) {
    return (
      <PageShell title="Conocimiento" subtitle="Extractor web · Documentos · Persona · Reglas · Idioma">
        <div className="flex items-center justify-center h-48"><Loader size={24} className="animate-spin text-gray-300" /></div>
      </PageShell>
    )
  }

  const hasStoredKey = config.ai_api_key === '••••••••'

  return (
    <PageShell title="Conocimiento" subtitle="Extractor web · Documentos · Persona · Reglas · Idioma">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-gray-400">
          Todo lo que el agente IA sabe sobre tu negocio
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader size={13} className="animate-spin" />
            : saveStatus === 'ok' ? <CheckCircle size={13} />
            : saveStatus === 'error' ? <XCircle size={13} />
            : <Save size={13} />}
          {saveStatus === 'ok' ? 'Guardado' : saveStatus === 'error' ? 'Error al guardar' : 'Guardar configuración'}
        </button>
      </div>

      <div className="flex gap-8">
        <SideNav activeSection={activeSection} />

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* ── SCRAPER ──────────────────────────────────────────── */}
          <section>
            <SectionHeader
              id="scraper"
              icon={Globe}
              label="Extractor web"
              sub="Analiza tu sitio y genera documentos de conocimiento automáticamente"
            />
            <ScraperSection hasStoredKey={hasStoredKey} onImport={handleImportDocs} />

            {/* Save API key to config */}
            {!hasStoredKey && (
              <p className="text-[11px] text-gray-400 mt-2">
                Guarda tu Anthropic API Key en la configuración para no tenerla que ingresar cada vez.{' '}
                <button
                  onClick={() => document.getElementById('persona')?.scrollIntoView({ behavior: 'smooth' })}
                  className="text-violet-500 hover:text-violet-700"
                >
                  Configurar →
                </button>
              </p>
            )}
          </section>

          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          <section>
            <SectionHeader
              id="overview"
              icon={BookOpen}
              label="Resumen del negocio"
              sub="El agente siempre ve este texto primero — qué es la empresa, qué vende y el tono"
            />
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <textarea
                value={config.overview || ''}
                onChange={e => setField('overview', e.target.value)}
                rows={6}
                placeholder="Ej. Alamex es una empresa global de elevadores con más de 50 años de experiencia e instalaciones en más de 20 países…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none"
              />
            </div>
          </section>

          {/* ── DOCUMENTS ────────────────────────────────────────── */}
          <section>
            <div className="flex items-start justify-between mb-4">
              <div id="docs" className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={15} className="text-violet-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Documentos de conocimiento</h2>
                  <p className="text-xs text-gray-400">{docs.length} documento{docs.length !== 1 ? 's' : ''} — el agente los lee al responder</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddNote(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:border-violet-300 hover:text-violet-600 text-gray-600 text-xs font-medium rounded-lg transition-colors"
              >
                <Plus size={12} /> Agregar nota
              </button>
            </div>

            {docs.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
                <FileText size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin documentos todavía</p>
                <p className="text-xs text-gray-300 mt-1">Usa el extractor web arriba o agrega notas manualmente</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => (
                  <DocCard key={doc.id} doc={doc} onDelete={handleDeleteDoc} onEdit={handleEditDoc} />
                ))}
              </div>
            )}
          </section>

          {/* ── PERSONA ──────────────────────────────────────────── */}
          <section>
            <SectionHeader
              id="persona"
              icon={Bot}
              label="Persona del agente"
              sub="Nombre, género, tono e identidad — cómo se presenta el agente"
            />
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del agente</label>
                  <input value={config.agent_name || ''} onChange={e => setField('agent_name', e.target.value)}
                    placeholder="Anna"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400" />
                  <p className="text-[11px] text-gray-400 mt-0.5">El nombre que usa el agente para sí mismo</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Género</label>
                  <select value={config.agent_gender || 'female'} onChange={e => setField('agent_gender', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400">
                    {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-0.5">Afecta pronombres en español</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Empresa</label>
                  <input value={config.company_name || ''} onChange={e => setField('company_name', e.target.value)}
                    placeholder="Alamex"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Tono</label>
                  <select
                    value={isCustomTone ? '__custom__' : (config.tone || '')}
                    onChange={e => {
                      if (e.target.value === '__custom__') { setIsCustomTone(true); setField('tone', '') }
                      else { setIsCustomTone(false); setField('tone', e.target.value) }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400">
                    {TONE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {isCustomTone && (
                    <input value={config.tone || ''} onChange={e => setField('tone', e.target.value)}
                      placeholder="Ej. cálido, natural y conciso" className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400" />
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Línea de identidad</label>
                <textarea value={config.identity_line || ''} onChange={e => setField('identity_line', e.target.value)}
                  rows={2} placeholder="Eres Anna, una persona real del equipo de atención al cliente de Alamex…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none" />
                <p className="text-[11px] text-gray-400 mt-0.5">La primera línea que define quién es el agente</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Descripción</label>
                <textarea value={config.agent_description || ''} onChange={e => setField('agent_description', e.target.value)}
                  rows={4} placeholder="Descripción de la personalidad del agente…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 resize-none" />
              </div>

              <div className="pt-2 border-t border-gray-50">
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  API Key de Anthropic
                  <span className="ml-1 text-gray-400 font-normal">(para el agente IA y el extractor web)</span>
                </label>
                <input
                  type="password"
                  value={config.ai_api_key || ''}
                  onChange={e => setField('ai_api_key', e.target.value)}
                  placeholder={hasStoredKey ? '(guardada — dejar vacío para no cambiar)' : 'sk-ant-api03-…'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 font-mono"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Llave global — se usa si el canal no tiene su propia llave. Guarda con el botón de arriba.
                </p>
              </div>
            </div>
          </section>

          {/* ── RULES ────────────────────────────────────────────── */}
          <section>
            <SectionHeader
              id="rules"
              icon={Sparkles}
              label="Reglas de comportamiento"
              sub="Instrucciones que el agente siempre sigue, en orden"
            />
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="space-y-2">
                {(config.behavior_rules || []).map((rule, i) => (
                  <RuleRow key={i} rule={rule} index={i} total={config.behavior_rules.length}
                    onChange={handleRuleChange} onRemove={handleRuleRemove} onMove={handleRuleMove} />
                ))}
              </div>
              {(config.behavior_rules || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Sin reglas — agrega la primera</p>
              )}
              <button onClick={handleRuleAdd}
                className="flex items-center gap-1.5 text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
                <Plus size={13} /> Agregar regla
              </button>
            </div>
          </section>

          {/* ── LANGUAGE ─────────────────────────────────────────── */}
          <section>
            <SectionHeader
              id="language"
              icon={Languages}
              label="Idioma"
              sub="Cómo el agente elige el idioma de respuesta"
            />
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Política de idioma</label>
                <select value={config.language_policy || 'mirror'} onChange={e => setField('language_policy', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400">
                  <option value="mirror">Espejo del cliente — responde en el mismo idioma</option>
                  <option value="fixed">Idioma fijo — usa siempre los idiomas soportados</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">El idioma se detecta automáticamente del último mensaje del cliente</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Idiomas soportados</label>
                <input value={config.supported_languages || ''} onChange={e => setField('supported_languages', e.target.value)}
                  placeholder="es, en, ar"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 font-mono" />
                <p className="text-[11px] text-gray-400 mt-0.5">Códigos separados por coma. El idioma de reserva es español.</p>
              </div>
            </div>
          </section>

          {/* Bottom spacer */}
          <div className="h-16" />
        </div>
      </div>

      {showAddNote && (
        <AddNoteModal onClose={() => setShowAddNote(false)} onSave={handleAddDoc} />
      )}
    </PageShell>
  )
}
