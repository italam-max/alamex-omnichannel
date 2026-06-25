import { useState, useEffect, useCallback, useRef } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Globe, Plus, Trash2, FileText, Save, Loader,
  ChevronUp, ChevronDown, CheckCircle, XCircle, X,
  Bot, BookOpen, Languages, Sparkles, Link,
  Eye, EyeOff, AlertCircle, Cpu, Zap, Wrench,
} from 'lucide-react'
import {
  getAIConfig, saveAIConfig,
  listDocs, createDoc, updateDoc, deleteDoc,
  scrapeWebsite,
} from '../../services/knowledge'
import CustomTools from './CustomTools'
import { confirm } from '../../store/confirm'
import { reportError } from '../../store/errors'

// ── Orchestration explainer ────────────────────────────────────────
// Shows how every field on this page is assembled, in order, into the
// single system prompt the agent reads before each conversation.

const ASSEMBLY = [
  { n: 1, label: 'Persona',  tag: 'inicio del prompt', from: 'Nombre · Empresa · Género · Tono · Identidad',
    desc: 'Quién es el agente y cómo habla.' },
  { n: 2, label: 'Contexto del negocio', tag: 'CONTEXTO DEL NEGOCIO', from: 'Resumen',
    desc: 'Lo que el agente siempre sabe de la empresa.' },
  { n: 3, label: 'Reglas', tag: 'REGLAS DE COMPORTAMIENTO', from: 'Reglas (en orden)',
    desc: 'Instrucciones y disparadores de acciones.' },
  { n: 4, label: 'Idioma', tag: 'final del prompt', from: 'Política de idioma',
    desc: 'En qué idioma responde.' },
  { n: 5, label: 'Herramientas', tag: 'HERRAMIENTAS', from: 'Fijas',
    desc: 'search_knowledge_base, create_lead, create_followup, handoff_to_human.' },
]

function OrchestrationCard() {
  return (
    <div className="kb-card" style={{ padding: '18px 20px', marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Cpu size={14} style={{ color: 'var(--gold)' }} />
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Cómo se orquesta el agente
        </span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
        Todo lo que configuras aquí se ensambla, <strong style={{ color: 'var(--text-mid)' }}>en este orden</strong>, en
        un único <em>prompt del sistema</em> que Claude recibe antes de cada conversación. Los
        <strong style={{ color: 'var(--text-mid)' }}> Documentos</strong> son la excepción: no van en el prompt, el
        agente los consulta en tiempo real con <code className="kb-tag">search_knowledge_base</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
        {ASSEMBLY.map(s => (
          <div key={s.n} className="kb-step">
            <span className="kb-step-num">{s.n}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{s.label}</p>
              <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', margin: '2px 0 5px', lineHeight: 1.4 }}>{s.desc}</p>
              <span className="kb-tag">{s.from}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Per-section callout ────────────────────────────────────────────

function AgentNote({ children }) {
  return (
    <div className="agent-note" style={{ marginBottom: '16px' }}>
      <Zap size={13} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }} />
      <span>{children}</span>
    </div>
  )
}

// ── Section anchor nav (matches prompt assembly order) ─────────────

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
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', scrollMarginTop: '16px' }}>
      <div className="kb-icon-tile">
        <Icon size={15} style={{ color: 'var(--gold)' }} />
      </div>
      <div>
        <h2 style={{
          fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0,
          fontFamily: "Georgia, 'Palatino Linotype', serif",
        }}>
          {label}
        </h2>
        {sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Web Scraper (helper that fills Documents) ──────────────────────

function ScraperSection({ onImport }) {
  const [url, setUrl]                 = useState('')
  const [apiKey, setApiKey]           = useState('')
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
  const allSelected = result && selectedCount === result.documents.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* URL + options */}
      <div className="kb-card" style={{ padding: '18px' }}>
        <label className="kb-label">URL del sitio web</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            border: '1px solid var(--border)', borderRadius: '9px', overflow: 'hidden', background: 'var(--surface)',
          }}>
            <Link size={13} style={{ marginLeft: '12px', color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScrape()}
              placeholder="https://www.tu-empresa.com"
              style={{ flex: 1, padding: '9px 10px', fontSize: '13px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)' }}
            />
          </div>
          <button onClick={handleScrape} disabled={loading || !url.trim()} className="btn-gold" style={{ whiteSpace: 'nowrap' }}>
            {loading ? <Loader size={13} className="animate-spin" /> : <Globe size={13} />}
            {loading ? 'Analizando…' : 'Extraer información'}
          </button>
        </div>

        {/* Options row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', marginTop: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={followLinks} onChange={e => setFollowLinks(e.target.checked)} className="kb-check" />
            <span style={{ fontSize: '12px', color: 'var(--text-mid)' }}>Seguir enlaces internos</span>
          </label>

          {followLinks && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Máx. páginas:</span>
              <select value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} className="kb-select" style={{ width: 'auto', padding: '5px 8px', fontSize: '12px' }}>
                {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <Bot size={12} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Analizar con IA</span>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-… (opcional)"
                className="kb-mono"
                style={{ fontSize: '12px', padding: '6px 8px', width: '176px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)' }}
              />
              <button type="button" onClick={() => setShowKey(s => !s)} style={{ padding: '0 8px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            </div>
          </div>
        </div>

        {/* Loading step indicator */}
        {loading && step && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--gold-pale)', borderRadius: '8px', marginTop: '14px' }}>
            <Loader size={12} className="animate-spin" style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--text-mid)' }}>{step}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'var(--crimson-pale)', borderRadius: '8px', marginTop: '14px', fontSize: '12px', color: 'var(--crimson)' }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="kb-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {result.ai_structured ? <Sparkles size={13} style={{ color: 'var(--gold)' }} /> : <FileText size={13} style={{ color: 'var(--text-muted)' }} />}
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-mid)' }}>
                {result.documents.length} documentos encontrados
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                · {result.pages_scraped} página{result.pages_scraped !== 1 ? 's' : ''} analizadas
                {result.ai_structured && ' · estructurado con IA'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => {
                  const s = {}
                  result.documents.forEach((_, i) => { s[i] = !allSelected })
                  setSelected(s)
                }}
                style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
              <button onClick={handleImport} disabled={selectedCount === 0} className="btn-gold">
                <Plus size={11} />
                Importar {selectedCount > 0 ? `${selectedCount} seleccionado${selectedCount !== 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </div>

          <div>
            {result.documents.map((doc, i) => (
              <div key={i} style={{
                display: 'flex', gap: '12px', padding: '14px 18px',
                borderBottom: i < result.documents.length - 1 ? '1px solid var(--border)' : 'none',
                background: selected[i] ? 'var(--gold-pale)' : 'transparent',
              }}>
                <input type="checkbox" checked={!!selected[i]} onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))} className="kb-check" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{doc.title}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{doc.content}</p>
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
    <div className="kb-card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
        <FileText size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
        {editing ? (
          <input className="kb-input" style={{ flex: 1, padding: '4px 6px', fontWeight: 600 }} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        ) : (
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
        )}
        <span className="kb-tag">Documento</span>
        <button onClick={() => setExpanded(e => !e)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button onClick={() => onDelete(doc.id)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--crimson)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <Trash2 size={14} />
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)' }}>
          {editing ? (
            <>
              <textarea className="kb-textarea" rows={6} value={content} onChange={e => setContent(e.target.value)} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={cancelEdit} style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-gold" style={{ padding: '6px 12px', fontSize: '11px' }}>
                  {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '13px', color: 'var(--text-mid)', whiteSpace: 'pre-wrap', lineHeight: 1.55, margin: 0 }}>{doc.content}</p>
              <button onClick={() => setEditing(true)} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '8px', padding: 0 }}>Editar</button>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="kb-card" style={{ width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(11,23,40,0.25)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Nueva nota</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="kb-label">Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Productos, FAQ, Cobertura…" autoFocus className="kb-input" />
          </div>
          <div>
            <label className="kb-label">Contenido</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Escribe o pega el contenido aquí…" rows={8} className="kb-textarea" />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} className="btn-gold">
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
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '8px', flexShrink: 0 }}>
        <button onClick={() => onMove(index, -1)} disabled={index === 0}
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', opacity: index === 0 ? 0.2 : 1 }}>
          <ChevronUp size={13} />
        </button>
        <button onClick={() => onMove(index, 1)} disabled={index === total - 1}
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', opacity: index === total - 1 ? 0.2 : 1 }}>
          <ChevronDown size={13} />
        </button>
      </div>
      <span className="kb-step-num" style={{ marginTop: '9px' }}>{index + 1}</span>
      <textarea value={rule} onChange={e => onChange(index, e.target.value)} rows={2} className="kb-textarea" style={{ flex: 1 }} />
      <button onClick={() => onRemove(index)} style={{ paddingTop: '8px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--crimson)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
        <X size={14} />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Knowledge() {
  const [config, setConfig]         = useState(null)
  const [docs, setDocs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [showAddNote, setShowAddNote] = useState(false)
  const [isCustomTone, setIsCustomTone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [cfg, docData] = await Promise.all([getAIConfig(), listDocs()])
      setConfig(cfg)
      setDocs(Array.isArray(docData) ? docData : (docData.results || []))
      setIsCustomTone(!!cfg.tone && !PRESET_VALUES.has(cfg.tone))
    } catch (e) {
      setLoadError(e.response?.data?.detail || e.message || 'Error al cargar la configuración')
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
    } catch (e) {
      reportError(e, 'Guardar configuración del agente')
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
    const doc = docs.find(d => d.id === id)
    const ok = await confirm({
      title: 'Eliminar documento',
      message: `¿Eliminar "${doc?.title ?? 'este documento'}" de la base de conocimiento?`,
      confirmLabel: 'Eliminar', danger: true,
    })
    if (!ok) return
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

  if (loading) {
    return (
      <PageShell title="Conocimiento" subtitle="Persona · Contexto · Documentos · Reglas · Idioma">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '192px' }}>
          <Loader size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      </PageShell>
    )
  }

  if (loadError || !config) {
    return (
      <PageShell title="Conocimiento" subtitle="Persona · Contexto · Documentos · Reglas · Idioma">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '192px', gap: '12px' }}>
          <AlertCircle size={28} style={{ color: 'var(--crimson)' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{loadError || 'No se pudo cargar la configuración'}</p>
          <button onClick={load} className="btn-outline"><Loader size={12} /> Reintentar</button>
        </div>
      </PageShell>
    )
  }

  const previewName = (config.agent_name || 'el agente').trim()
  const previewCompany = (config.company_name || 'tu empresa').trim()

  return (
    <PageShell title="Conocimiento" subtitle="Persona · Contexto · Documentos · Reglas · Idioma">
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Todo lo que <strong style={{ color: 'var(--text-mid)' }}>{previewName}</strong> sabe y cómo se comporta al atender a clientes de <strong style={{ color: 'var(--text-mid)' }}>{previewCompany}</strong>
        </p>
        <button onClick={handleSave} disabled={saving} className="btn-gold">
          {saving ? <Loader size={13} className="animate-spin" />
            : saveStatus === 'ok' ? <CheckCircle size={13} />
            : saveStatus === 'error' ? <XCircle size={13} />
            : <Save size={13} />}
          {saveStatus === 'ok' ? 'Guardado' : saveStatus === 'error' ? 'Error al guardar' : 'Guardar configuración'}
        </button>
      </div>

      <OrchestrationCard />

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '860px' }}>

          {/* ── PERSONA ──────────────────────────────────────────── */}
          <section>
            <SectionHeader id="persona" icon={Bot} label="Persona del agente"
              sub="Quién es, cómo se llama y cómo habla — se ensambla al inicio del prompt" />
            <AgentNote>
              <strong>Nombre</strong>, <strong>Empresa</strong>, <strong>Género</strong> y <strong>Tono</strong> moldean
              directamente al agente. La <strong>Línea de identidad</strong> es opcional: si la dejas vacía, se genera
              automáticamente con el nombre y la empresa. La <strong>Descripción</strong> añade personalidad.
            </AgentNote>
            <div className="kb-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="kb-label">Nombre del agente</label>
                  <input value={config.agent_name || ''} onChange={e => setField('agent_name', e.target.value)} placeholder="Sara" className="kb-input" />
                  <p className="kb-hint">El nombre con el que el agente se presenta</p>
                </div>
                <div>
                  <label className="kb-label">Género</label>
                  <select value={config.agent_gender || 'female'} onChange={e => setField('agent_gender', e.target.value)} className="kb-select">
                    {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <p className="kb-hint">Afecta los pronombres en español</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="kb-label">Empresa</label>
                  <input value={config.company_name || ''} onChange={e => setField('company_name', e.target.value)} placeholder="Elevadores del Norte" className="kb-input" />
                  <p className="kb-hint">La empresa que representa</p>
                </div>
                <div>
                  <label className="kb-label">Tono</label>
                  <select
                    value={isCustomTone ? '__custom__' : (config.tone || '')}
                    onChange={e => {
                      if (e.target.value === '__custom__') { setIsCustomTone(true); setField('tone', '') }
                      else { setIsCustomTone(false); setField('tone', e.target.value) }
                    }}
                    className="kb-select">
                    {TONE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {isCustomTone && (
                    <input value={config.tone || ''} onChange={e => setField('tone', e.target.value)} placeholder="Ej. cálido, natural y conciso" className="kb-input" style={{ marginTop: '8px' }} />
                  )}
                </div>
              </div>

              <div>
                <label className="kb-label">Línea de identidad <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
                <textarea value={config.identity_line || ''} onChange={e => setField('identity_line', e.target.value)}
                  rows={2} placeholder={`Vacío → se genera: "Eres ${previewName}, del equipo de atención al cliente de ${previewCompany}."`} className="kb-textarea" />
                <p className="kb-hint">Override de la primera línea. Déjala vacía para generarla con Nombre + Empresa.</p>
              </div>

              <div>
                <label className="kb-label">Descripción</label>
                <textarea value={config.agent_description || ''} onChange={e => setField('agent_description', e.target.value)}
                  rows={4} placeholder="Personalidad y objetivo del agente: a quién atiende, qué busca lograr…" className="kb-textarea" />
              </div>
            </div>
          </section>

          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          <section>
            <SectionHeader id="overview" icon={BookOpen} label="Resumen del negocio"
              sub="Lo que el agente siempre sabe — qué es la empresa y qué ofrece" />
            <AgentNote>
              Este texto se inyecta en el prompt bajo <code className="kb-tag">CONTEXTO DEL NEGOCIO</code>.
              Claude lo recibe <em>antes de cada conversación</em> como conocimiento general — a diferencia de los
              Documentos, que solo se consultan cuando hacen falta.
            </AgentNote>
            <div className="kb-card" style={{ padding: '20px' }}>
              <textarea
                value={config.overview || ''}
                onChange={e => setField('overview', e.target.value)}
                rows={6}
                placeholder="Ej. Elevadores del Norte instala y da mantenimiento a elevadores residenciales, comerciales e industriales, con cobertura nacional y servicio 24/7…"
                className="kb-textarea"
              />
            </div>
          </section>

          {/* ── DOCUMENTS (+ scraper) ────────────────────────────── */}
          <section>
            <SectionHeader id="docs" icon={FileText} label="Documentos de conocimiento"
              sub="Fuentes que el agente consulta en tiempo real — no van en el prompt" />
            <AgentNote>
              Cada documento es una <strong>fuente de verdad</strong> que el agente consulta con
              <strong> search_knowledge_base</strong> cuando necesita responder algo específico. Ahorra tokens:
              solo se leen cuando Claude los necesita. Usa el <strong>extractor web</strong> para generarlos desde tu sitio.
            </AgentNote>

            <ScraperSection onImport={handleImportDocs} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 12px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                {docs.length} documento{docs.length !== 1 ? 's' : ''} guardado{docs.length !== 1 ? 's' : ''}
              </p>
              <button onClick={() => setShowAddNote(true)} className="btn-outline">
                <Plus size={12} /> Agregar nota
              </button>
            </div>

            {docs.length === 0 ? (
              <div className="kb-card" style={{ padding: '32px', textAlign: 'center', borderStyle: 'dashed' }}>
                <FileText size={28} style={{ color: 'var(--border)', margin: '0 auto 8px' }} />
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Sin documentos todavía</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0', opacity: 0.7 }}>Usa el extractor web arriba o agrega notas manualmente</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {docs.map(doc => (
                  <DocCard key={doc.id} doc={doc} onDelete={handleDeleteDoc} onEdit={handleEditDoc} />
                ))}
              </div>
            )}
          </section>

          {/* ── RULES ────────────────────────────────────────────── */}
          <section>
            <SectionHeader id="rules" icon={Sparkles} label="Reglas de comportamiento"
              sub="Instrucciones que el agente sigue siempre, en orden" />
            <AgentNote>
              Se incluyen en el prompt bajo <code className="kb-tag">REGLAS DE COMPORTAMIENTO</code>. Úsalas para
              disparar acciones: <em>"Si el cliente menciona una empresa, llama create_lead"</em>, o para poner límites:
              <em> "No ofrezcas descuentos sin aprobación"</em>.
            </AgentNote>
            <div className="kb-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(config.behavior_rules || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(config.behavior_rules || []).map((rule, i) => (
                    <RuleRow key={i} rule={rule} index={i} total={config.behavior_rules.length}
                      onChange={handleRuleChange} onRemove={handleRuleRemove} onMove={handleRuleMove} />
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>Sin reglas — agrega la primera</p>
              )}
              <button onClick={handleRuleAdd}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Plus size={13} /> Agregar regla
              </button>
            </div>
          </section>

          {/* ── LANGUAGE ─────────────────────────────────────────── */}
          <section>
            <SectionHeader id="language" icon={Languages} label="Idioma"
              sub="Cómo el agente elige el idioma de respuesta" />
            <AgentNote>
              Se agrega al final del prompt. Con <strong>Espejo</strong>, Claude detecta el idioma del cliente y responde
              igual. Con <strong>Fijo</strong>, usa siempre los idiomas listados (útil para marcas que requieren consistencia).
            </AgentNote>
            <div className="kb-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="kb-label">Política de idioma</label>
                <select value={config.language_policy || 'mirror'} onChange={e => setField('language_policy', e.target.value)} className="kb-select">
                  <option value="mirror">Espejo del cliente — responde en el mismo idioma</option>
                  <option value="fixed">Idioma fijo — usa siempre los idiomas soportados</option>
                </select>
                <p className="kb-hint">El idioma se detecta automáticamente del último mensaje del cliente</p>
              </div>
              <div>
                <label className="kb-label">Idiomas soportados</label>
                <input value={config.supported_languages || ''} onChange={e => setField('supported_languages', e.target.value)} placeholder="es, en, ar" className="kb-input kb-mono" />
                <p className="kb-hint">Códigos separados por coma. El idioma de reserva es español.</p>
              </div>
            </div>
          </section>

          {/* ── TOOLS: system (read-only) + custom ───────────────── */}
          <section>
            <SectionHeader id="tools" icon={Wrench} label="Herramientas del agente"
              sub="Acciones que el agente ejecuta — del sistema (siempre activas) y las que tú creas" />
            <AgentNote>
              Las <strong>del sistema</strong> vienen siempre incluidas. Las <strong>personalizadas</strong> las
              defines tú sin escribir código: el agente las llama y nuestra plataforma las ejecuta de forma segura.
            </AgentNote>

            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Del sistema</p>
            <div className="kb-card" style={{ padding: '8px', marginBottom: '24px' }}>
              {[
                ['search_knowledge_base', 'Consulta los Documentos antes de responder preguntas del negocio.'],
                ['create_lead', 'Registra un interesado cuando el cliente quiere comprar o cotizar.'],
                ['create_followup', 'Agenda un seguimiento cuando el cliente pide que lo contacten.'],
                ['handoff_to_human', 'Deriva la conversación a un agente humano cuando hace falta.'],
              ].map(([name, desc], i, arr) => (
                <div key={name} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <Zap size={13} style={{ color: 'var(--jade)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span className="kb-tag" style={{ background: 'var(--jade-pale)', color: 'var(--jade)' }}>{name}</span>
                    <p style={{ fontSize: '12px', color: 'var(--text-mid)', margin: '4px 0 0', lineHeight: 1.45 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Personalizadas</p>
            <CustomTools />
          </section>

          {/* Bottom spacer */}
          <div style={{ height: '64px' }} />
      </div>

      {showAddNote && (
        <AddNoteModal onClose={() => setShowAddNote(false)} onSave={handleAddDoc} />
      )}
    </PageShell>
  )
}
