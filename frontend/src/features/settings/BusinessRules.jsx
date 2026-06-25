import { useState, useEffect } from 'react'
import {
  Save, Loader, Check, AlertTriangle, Mail,
  Clock, Bot, Building2, ShieldAlert,
} from 'lucide-react'
import { getWorkspace, updateWorkspace } from '../../services/accounts'

const field = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }
const label = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '5px' }

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{
        width: '38px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer',
        background: on ? 'var(--jade)' : 'var(--sand-2)', position: 'relative', transition: 'background 0.15s', flexShrink: 0,
      }}>
      <span style={{
        position: 'absolute', top: '2px', left: on ? '18px' : '2px',
        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

export default function BusinessRules() {
  const [ws, setWs]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    getWorkspace().then(setWs).catch(() => setError('No se pudo cargar la configuración.')).finally(() => setLoading(false))
  }, [])

  const set = (k, v) => { setWs(w => ({ ...w, [k]: v })); setSaved(false) }

  const save = async () => {
    setError(''); setSaving(true)
    try {
      const updated = await updateWorkspace({
        company_name: ws.company_name,
        sla_warning_minutes:  Number(ws.sla_warning_minutes),
        sla_critical_minutes: Number(ws.sla_critical_minutes),
        sla_escalate_minutes: Number(ws.sla_escalate_minutes),
        escalation_enabled:   ws.escalation_enabled,
        escalation_email:     ws.escalation_email,
        alert_on_dashboard:   ws.alert_on_dashboard,
        auto_reassign:        ws.auto_reassign,
        relevance_filter_enabled: ws.relevance_filter_enabled,
      })
      setWs(updated)
      setSaved(true)
    } catch (e) {
      const d = e?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
      <Loader size={20} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
    </div>
  )
  if (!ws) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(11,23,40,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Company */}
      <div>
        <label style={label}><Building2 size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Nombre de la empresa</label>
        <input style={field} value={ws.company_name} onChange={e => set('company_name', e.target.value)} />
      </div>

      {/* SLA thresholds */}
      <div>
        <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={13} style={{ color: 'var(--gold)' }} /> Tiempos de respuesta (SLA)
        </p>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Minutos que una conversación puede esperar a un humano antes de subir de nivel. La <strong>Escalada</strong> dispara la alerta por correo y en el dashboard.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { k: 'sla_warning_minutes',  lbl: 'Aviso',    c: '#D97706' },
            { k: 'sla_critical_minutes', lbl: 'Crítico',  c: 'var(--crimson)' },
            { k: 'sla_escalate_minutes', lbl: 'Escalada', c: 'var(--crimson)' },
          ].map(t => (
            <div key={t.k}>
              <label style={{ ...label, color: t.c }}>{t.lbl}</label>
              <div style={{ position: 'relative' }}>
                <input style={{ ...field, paddingRight: '38px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                  type="number" min="1" value={ws[t.k]} onChange={e => set(t.k, e.target.value)} />
                <span style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>min</span>
              </div>
            </div>
          ))}
        </div>
        {!(Number(ws.sla_warning_minutes) < Number(ws.sla_critical_minutes) && Number(ws.sla_critical_minutes) < Number(ws.sla_escalate_minutes)) && (
          <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--crimson)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <AlertTriangle size={11} /> Deben ser crecientes: Aviso &lt; Crítico &lt; Escalada.
          </p>
        )}
      </div>

      {/* Escalation */}
      <div style={{ borderTop: '1px solid var(--sand)', paddingTop: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={14} style={{ color: 'var(--crimson)' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Escalada y alertas</span>
          </div>
          <Toggle on={ws.escalation_enabled} onChange={v => set('escalation_enabled', v)} />
        </div>

        {ws.escalation_enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingLeft: '2px' }}>
            <div>
              <label style={label}><Mail size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Correo que recibe las alertas</label>
              <input style={field} type="email" value={ws.escalation_email} onChange={e => set('escalation_email', e.target.value)} placeholder="alertas@miempresa.mx" />
            </div>
            {[
              { k: 'alert_on_dashboard', lbl: 'Mostrar escaladas en el dashboard del admin' },
              { k: 'auto_reassign',      lbl: 'Reasignar automáticamente al agente libre con menos carga' },
            ].map(t => (
              <div key={t.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-mid)' }}>{t.lbl}</span>
                <Toggle on={ws[t.k]} onChange={v => set(t.k, v)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Relevance / anti-spam */}
      <div style={{ borderTop: '1px solid var(--sand)', paddingTop: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Bot size={14} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Filtro de relevancia (anti-spam)</p>
              <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '420px' }}>
                La IA evalúa cada mensaje y guarda silencio ante acuses ("ok", "gracias"), emojis sueltos, publicidad o texto sin sentido — evita responder spam y ahorra créditos.
              </p>
            </div>
          </div>
          <Toggle on={ws.relevance_filter_enabled} onChange={v => set('relevance_filter_enabled', v)} />
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--sand)', paddingTop: '16px' }}>
        {error && <span style={{ fontSize: '11px', color: 'var(--crimson)', marginRight: 'auto' }}>{error}</span>}
        {saved && !error && (
          <span style={{ fontSize: '12px', color: 'var(--jade)', display: 'flex', alignItems: 'center', gap: '5px', marginRight: 'auto' }}>
            <Check size={13} /> Reglas guardadas
          </span>
        )}
        <button onClick={save} disabled={saving} className="btn-gold" style={{ padding: '9px 18px', fontSize: '13px', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Guardar reglas
        </button>
      </div>
    </div>
  )
}
