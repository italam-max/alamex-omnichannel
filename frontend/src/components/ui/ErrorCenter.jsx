import { useState } from 'react'
import { AlertTriangle, X, Copy, Check, FileWarning, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useErrors, formatReport } from '../../store/errors'

function copyText(text) {
  try { navigator.clipboard?.writeText(text) } catch { /* no clipboard */ }
}

function IncidentCard({ e, onDismiss }) {
  const [copied, setCopied] = useState(false)
  const report = () => { copyText(formatReport(e)); setCopied(true); setTimeout(() => setCopied(false), 2500) }

  return (
    <div style={{
      width: '360px', maxWidth: 'calc(100vw - 32px)',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--crimson)', borderRadius: '12px',
      boxShadow: '0 14px 44px rgba(11,23,40,0.22)', overflow: 'hidden',
      animation: 'menuIn 0.16s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <div style={{ display: 'flex', gap: '11px', padding: '14px 14px 12px' }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
          background: 'var(--crimson-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--crimson)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{e.title}</p>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>{e.message}</p>
        </div>
        <button onClick={() => onDismiss(e.code)} aria-label="Descartar incidencia"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', height: '20px' }}>
          <X size={14} />
        </button>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '9px 14px', background: 'var(--sand)', borderTop: '1px solid var(--border)',
      }}>
        <button onClick={() => copyText(e.code)} title="Copiar código"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, color: 'var(--text-mid)' }}>
          <span className="kb-tag" style={{ fontSize: '11px' }}>{e.code}</span>
          <Copy size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button onClick={report}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700,
            color: copied ? 'var(--jade)' : 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {copied ? <Check size={13} /> : <FileWarning size={13} />}
          {copied ? 'Reporte copiado' : 'Reportar'}
        </button>
      </div>
    </div>
  )
}

function History({ log, onClear, onClose }) {
  return (
    <div style={{
      width: '360px', maxWidth: 'calc(100vw - 32px)', maxHeight: '50vh', display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
      boxShadow: '0 14px 44px rgba(11,23,40,0.22)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>
          Historial de incidencias
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {log.length > 0 && (
            <button onClick={onClear} title="Limpiar historial" aria-label="Limpiar historial"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={onClose} aria-label="Cerrar historial"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <div style={{ overflowY: 'auto' }}>
        {log.length === 0 ? (
          <p style={{ padding: '22px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            Sin incidencias registradas
          </p>
        ) : log.map(e => (
          <div key={e.code} style={{ padding: '10px 14px', borderBottom: '1px solid var(--sand-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <button onClick={() => copyText(formatReport(e))} title="Copiar reporte"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span className="kb-tag" style={{ fontSize: '10.5px' }}>{e.code}</span>
                <Copy size={10} style={{ color: 'var(--text-muted)' }} />
              </button>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {new Date(e.at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-mid)' }}>
              {e.context ? `${e.context} — ` : ''}{e.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Mounted once at the app root.
export default function ErrorCenter() {
  const { active, log, dismiss, clearLog } = useErrors()
  const [showHistory, setShowHistory] = useState(false)

  if (active.length === 0 && !showHistory && log.length === 0) return null

  return (
    <div style={{
      position: 'fixed', right: '20px', bottom: '20px', zIndex: 300,
      display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end',
    }}>
      {showHistory && (
        <History log={log} onClear={clearLog} onClose={() => setShowHistory(false)} />
      )}

      {active.map(e => <IncidentCard key={e.code} e={e} onDismiss={dismiss} />)}

      {(log.length > 0 || active.length > 0) && !showHistory && (
        <button onClick={() => setShowHistory(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600,
            color: 'var(--text-mid)', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '99px', padding: '6px 12px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(11,23,40,0.1)' }}>
          <ChevronUp size={12} /> Historial de incidencias ({log.length})
        </button>
      )}
    </div>
  )
}
