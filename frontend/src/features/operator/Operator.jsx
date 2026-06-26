import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Plus, Loader, X, Copy, Check, Building2, Power, PlusCircle, Link2,
} from 'lucide-react'
import {
  listOrgs, createOrg, setOrgActive, rechargeCredits, reissueInvite, accessLinkUrl,
} from '../../services/operator'
import { confirm } from '../../store/confirm'
import { reportError } from '../../store/errors'

const money = (v) => `$${Number(v ?? 0).toFixed(2)}`

function copyText(t) { try { navigator.clipboard?.writeText(t) } catch { /* noop */ } }

// ── Access-link modal (shareable) ─────────────────────────────────
function LinkModal({ org, link, onClose }) {
  const [copied, setCopied] = useState(false)
  const url = accessLinkUrl(link)
  const copy = () => { copyText(url); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  return (
    <div style={overlay} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-card" style={{ maxWidth: '460px', width: '100%' }}>
        <div style={{ padding: '20px 24px 16px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Liga de acceso · {org}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Compártela con la empresa. Con ella crean su contraseña y entran. Caduca y es de un solo uso.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <input readOnly value={url} className="kb-input kb-mono" style={{ fontSize: '12px' }}
              onFocus={e => e.target.select()} />
            <button onClick={copy} className="btn-gold" style={{ whiteSpace: 'nowrap' }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--sand)', textAlign: 'right' }}>
          <button onClick={onClose} className="btn-outline">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── Create-org modal ──────────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', admin_email: '', credits: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    setSaving(true); setError('')
    try {
      const org = await createOrg({
        name: form.name.trim(), admin_email: form.admin_email.trim(),
        credits: Number(form.credits) || 0,
      })
      onCreated(org)
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo crear la empresa.')
      setSaving(false)
    }
  }

  return (
    <div style={overlay} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-card" style={{ maxWidth: '460px', width: '100%' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Nueva empresa</h2>
          <button onClick={onClose} aria-label="Cerrar" style={iconBtn}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="kb-label">Nombre de la empresa</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme S.A." autoFocus className="kb-input" />
          </div>
          <div>
            <label className="kb-label">Correo del administrador</label>
            <input value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="admin@acme.mx" className="kb-input kb-mono" />
            <p className="kb-hint">Recibirá la liga de acceso para crear su contraseña.</p>
          </div>
          <div>
            <label className="kb-label">Créditos iniciales (USD)</label>
            <input value={form.credits} onChange={e => set('credits', e.target.value)} placeholder="0" className="kb-input" />
          </div>
          {error && <div style={{ fontSize: '12px', color: 'var(--crimson)', background: 'var(--crimson-pale)', borderRadius: '8px', padding: '8px 12px' }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} className="btn-outline">Cancelar</button>
          <button onClick={submit} disabled={saving || !form.name.trim() || !form.admin_email.trim()} className="btn-gold">
            {saving ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} Crear empresa
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.5)', backdropFilter: 'blur(2px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }
const th = { textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 700, padding: '10px 14px', borderBottom: '1px solid var(--border)' }
const td = { padding: '12px 14px', borderBottom: '1px solid var(--sand-2)', fontSize: '13px', color: 'var(--text-mid)' }

export default function Operator() {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [link, setLink] = useState(null)   // { org, link }

  const load = useCallback(async () => {
    setLoading(true)
    try { setOrgs(await listOrgs()) } catch (e) { reportError(e, 'Cargar empresas') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const onCreated = (org) => {
    setCreating(false)
    setOrgs(o => [...o, org])
    setLink({ org: org.name, link: org.access_link })
  }

  const toggleActive = async (org) => {
    const ok = await confirm({
      title: org.is_active ? 'Suspender empresa' : 'Reactivar empresa',
      message: `¿${org.is_active ? 'Suspender' : 'Reactivar'} "${org.name}"?`,
      confirmLabel: org.is_active ? 'Suspender' : 'Reactivar', danger: org.is_active,
    })
    if (!ok) return
    try {
      const r = await setOrgActive(org.slug, !org.is_active)
      setOrgs(os => os.map(o => o.slug === org.slug ? { ...o, is_active: r.is_active } : o))
    } catch (e) { reportError(e, 'Cambiar estado de empresa') }
  }

  const recharge = async (org) => {
    const amount = window.prompt(`Recargar créditos a ${org.name} (USD):`, '10')
    if (!amount) return
    try {
      const r = await rechargeCredits(org.slug, amount)
      setOrgs(os => os.map(o => o.slug === org.slug ? { ...o, credits_usd: r.credits_usd } : o))
    } catch (e) { reportError(e, 'Recargar créditos') }
  }

  const getLink = async (org) => {
    try { setLink({ org: org.name, link: await reissueInvite(org.slug) }) }
    catch (e) { reportError(e, 'Generar liga de acceso') }
  }

  return (
    <PageShell title="Empresas" subtitle="Consola de operador · gestión de organizaciones">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          {orgs.length} empresa{orgs.length !== 1 ? 's' : ''} en la plataforma
        </p>
        <button onClick={() => setCreating(true)} className="btn-gold"><Plus size={13} /> Nueva empresa</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : orgs.length === 0 ? (
        <div className="kb-card" style={{ padding: '36px', textAlign: 'center', borderStyle: 'dashed' }}>
          <Building2 size={26} style={{ color: 'var(--border)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Sin empresas todavía</p>
        </div>
      ) : (
        <div className="kb-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px', fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr>
                <th style={th}>Empresa</th><th style={th}>Estado</th><th style={th}>Usuarios</th>
                <th style={th}>Convs.</th><th style={th}>Créditos</th><th style={th}>Uso 30d</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {orgs.map(o => (
                  <tr key={o.slug}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{o.name}</div>
                      <div className="kb-tag" style={{ marginTop: '3px' }}>{o.slug}</div>
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                        background: o.is_active ? 'var(--jade-pale)' : 'var(--crimson-pale)', color: o.is_active ? 'var(--jade)' : 'var(--crimson)' }}>
                        {o.is_active ? 'Activa' : 'Suspendida'}
                      </span>
                    </td>
                    <td style={td}>{o.users}</td>
                    <td style={td}>{o.conversations}</td>
                    <td style={td}>{money(o.credits_usd)}</td>
                    <td style={td}>{o.usage_30d?.messages ?? 0} msj · {money(o.usage_30d?.cost_usd)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => getLink(o)} title="Liga de acceso" aria-label="Liga de acceso" style={iconBtn2}><Link2 size={15} /></button>
                      <button onClick={() => recharge(o)} title="Recargar créditos" aria-label="Recargar créditos" style={iconBtn2}><PlusCircle size={15} /></button>
                      <button onClick={() => toggleActive(o)} title={o.is_active ? 'Suspender' : 'Reactivar'} aria-label="Suspender o reactivar"
                        style={{ ...iconBtn2, color: o.is_active ? 'var(--crimson)' : 'var(--jade)' }}><Power size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={onCreated} />}
      {link && <LinkModal org={link.org} link={link.link} onClose={() => setLink(null)} />}
    </PageShell>
  )
}

const iconBtn2 = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px' }
