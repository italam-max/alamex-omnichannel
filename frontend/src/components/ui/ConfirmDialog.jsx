import { useEffect, useRef } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { useConfirm } from '../../store/confirm'

// Single instance mounted at the app root. Premium, accessible confirm dialog:
// Escape and backdrop cancel, the confirm button is focused on open.
export default function ConfirmDialog() {
  const { open, options, respond } = useConfirm()
  const confirmRef = useRef(null)

  const danger = !!options.danger
  const title = options.title || (danger ? 'Confirmar acción' : '¿Continuar?')
  const message = options.message || ''
  const confirmLabel = options.confirmLabel || (danger ? 'Eliminar' : 'Confirmar')
  const cancelLabel = options.cancelLabel || 'Cancelar'

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') respond(false)
      if (e.key === 'Enter')  respond(true)
    }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => confirmRef.current?.focus(), 30)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, respond])

  if (!open) return null

  const accent = danger ? 'var(--crimson)' : 'var(--gold)'
  const accentPale = danger ? 'var(--crimson-pale)' : 'var(--gold-pale)'
  const Icon = danger ? AlertTriangle : HelpCircle

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) respond(false) }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(11,23,40,0.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        animation: 'fadeIn 0.12s ease-out',
      }}
    >
      <div
        role="alertdialog" aria-modal="true" aria-label={title}
        className="kb-card"
        style={{ width: '100%', maxWidth: '404px', overflow: 'hidden',
          boxShadow: '0 24px 70px rgba(11,23,40,0.35)', animation: 'menuIn 0.14s cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div style={{ padding: '24px 24px 20px', display: 'flex', gap: '14px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
            background: accentPale, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={19} style={{ color: accent }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)',
              fontFamily: "Georgia, 'Palatino Linotype', serif" }}>
              {title}
            </h2>
            {message && (
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {message}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--sand)' }}>
          <button
            onClick={() => respond(false)}
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-mid)', padding: '8px 16px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '9px', cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => respond(true)}
            style={{ fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '9px', cursor: 'pointer',
              border: 'none', color: danger ? '#fff' : 'var(--ink)', background: accent }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
