import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Users, Plus, Shield, ShieldCheck, User, Loader, X, Edit2,
  UserX, UserCheck, AlertTriangle, Check, Hash,
} from 'lucide-react'
import {
  getAgents, createAgent, updateAgent, deactivateAgent, reactivateAgent, getMe,
} from '../../services/accounts'
import { listChannels } from '../../services/channels'

// ── Config ──────────────────────────────────────────────────────────

const ROLE_CFG = {
  admin:      { label: 'Administrador', icon: ShieldCheck, color: 'var(--crimson)', bg: 'var(--crimson-pale)', border: 'rgba(122,28,42,0.2)' },
  supervisor: { label: 'Supervisor',    icon: Shield,      color: 'var(--gold)',    bg: 'var(--gold-vp)',      border: 'rgba(192,155,58,0.25)' },
  agent:      { label: 'Agente',        icon: User,        color: 'var(--jade)',    bg: 'var(--jade-pale)',    border: 'rgba(26,92,58,0.2)' },
}

const AVAIL_CFG = {
  online: { label: 'En línea', dot: 'var(--jade)',       glow: 'rgba(26,92,58,0.5)' },
  busy:   { label: 'Ocupado',  dot: 'var(--gold)',       glow: 'rgba(192,155,58,0.5)' },
  away:   { label: 'Ausente',  dot: 'var(--text-muted)', glow: 'none' },
}

const CHANNEL_LABEL = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', website: 'Web',
}

const PERM_LABELS = {
  manage_agents:   'Gestionar agentes',
  configure_rules: 'Configurar reglas',
  manage_channels: 'Gestionar canales',
  view_all_convs:  'Ver todas las conversaciones',
  reassign:        'Reasignar conversaciones',
  view_billing:    'Ver facturación',
  attend_convs:    'Atender conversaciones',
}

// ── Role badge ──────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const c = ROLE_CFG[role] ?? ROLE_CFG.agent
  const Icon = c.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 9px', borderRadius: '99px',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontSize: '10px', fontWeight: 700,
    }}>
      <Icon size={10} /> {c.label}
    </span>
  )
}

// ── Agent card ──────────────────────────────────────────────────────

function AgentCard({ agent, canManage, onEdit, onToggleActive }) {
  const role  = ROLE_CFG[agent.role] ?? ROLE_CFG.agent
  const avail = AVAIL_CFG[agent.availability] ?? AVAIL_CFG.away
  const inactive = !agent.is_active

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${inactive ? 'var(--border)' : role.border}`,
      borderRadius: '12px',
      padding: '16px',
      borderLeft: `3px solid ${inactive ? 'var(--sand-2)' : role.color}`,
      opacity: inactive ? 0.62 : 1,
      transition: 'box-shadow 0.15s, opacity 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(11,23,40,0.1)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Top */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'var(--sand-2)', border: `1.5px solid ${role.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 700, color: role.color,
            }}>
              {agent.initials}
            </div>
            <span style={{
              position: 'absolute', bottom: '-1px', right: '-1px',
              width: '11px', height: '11px', borderRadius: '50%',
              background: avail.dot, border: '2px solid var(--surface)',
              boxShadow: avail.glow !== 'none' ? `0 0 5px ${avail.glow}` : 'none',
            }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              {agent.name}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
              {agent.email}
            </p>
          </div>
        </div>
        <RoleBadge role={agent.role} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: avail.dot }} />
          {inactive ? 'Dado de baja' : avail.label}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <Hash size={10} /> {agent.active_conversation_count} activas · máx {agent.max_concurrent}
        </span>
      </div>

      {/* Channels */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px', minHeight: '20px' }}>
        {(agent.channel_ids ?? []).length === 0 ? (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin canales asignados</span>
        ) : (
          (agent._channels ?? []).map(ch => (
            <span key={ch.id} style={{
              fontSize: '10px', fontWeight: 600, color: 'var(--text-mid)',
              background: 'var(--sand)', padding: '2px 8px', borderRadius: '99px',
              border: '1px solid var(--border)',
            }}>
              {CHANNEL_LABEL[ch.type] ?? ch.name}
            </span>
          ))
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div style={{ display: 'flex', gap: '7px', borderTop: '1px solid var(--sand)', paddingTop: '12px' }}>
          <button onClick={() => onEdit(agent)} className="btn-outline" style={{ padding: '6px 12px', fontSize: '11px' }}>
            <Edit2 size={11} /> Editar
          </button>
          {inactive ? (
            <button
              onClick={() => onToggleActive(agent, true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '8px',
                background: 'var(--jade-pale)', color: 'var(--jade)',
                border: '1px solid rgba(26,92,58,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              }}
            >
              <UserCheck size={11} /> Reactivar
            </button>
          ) : (
            <button
              onClick={() => onToggleActive(agent, false)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '8px',
                background: 'transparent', color: 'var(--crimson)',
                border: '1px solid rgba(122,28,42,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              }}
            >
              <UserX size={11} /> Dar de baja
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Agent form modal ────────────────────────────────────────────────

const EMPTY_FORM = {
  display_name: '', new_email: '', new_password: '',
  role: 'agent', availability: 'away', max_concurrent: 5, phone: '',
  channel_ids: [],
}

function AgentModal({ agent, channels, onSave, onClose }) {
  const editing = !!agent
  const [form, setForm] = useState(() => agent ? {
    display_name: agent.display_name || agent.name || '',
    new_email: '', new_password: '',
    role: agent.role, availability: agent.availability,
    max_concurrent: agent.max_concurrent, phone: agent.phone || '',
    channel_ids: agent.channel_ids ?? [],
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleChannel = (id) => set('channel_ids',
    form.channel_ids.includes(id) ? form.channel_ids.filter(c => c !== id) : [...form.channel_ids, id])

  const submit = async () => {
    setError(''); setSaving(true)
    try {
      const payload = {
        display_name: form.display_name, role: form.role,
        availability: form.availability, max_concurrent: Number(form.max_concurrent),
        phone: form.phone, channel_ids: form.channel_ids,
      }
      if (!editing) {
        payload.new_email = form.new_email
        payload.new_password = form.new_password
      } else if (form.new_password) {
        payload.new_password = form.new_password
      }
      await onSave(payload, agent?.id)
    } catch (e) {
      const d = e?.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'No se pudo guardar.')
      setSaving(false)
    }
  }

  const field = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }
  const label = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '5px' }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px',
        animation: 'menuIn 0.15s cubic-bezier(0.4,0,0.2,1)',
      }}>
      <div style={{
        width: '440px', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(11,23,40,0.22)',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>
            {editing ? `Editar ${agent.name}` : 'Nuevo agente'}
          </h3>
          <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={label}>Nombre completo</label>
            <input style={field} value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Ana García" />
          </div>

          {!editing && (
            <>
              <div>
                <label style={label}>Correo (será su usuario)</label>
                <input style={field} type="email" value={form.new_email} onChange={e => set('new_email', e.target.value)} placeholder="ana@empresa.mx" />
              </div>
              <div>
                <label style={label}>Contraseña inicial</label>
                <input style={field} type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} placeholder="Mínimo 8 caracteres" />
              </div>
            </>
          )}
          {editing && (
            <div>
              <label style={label}>Nueva contraseña (opcional)</label>
              <input style={field} type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} placeholder="Dejar vacío para no cambiar" />
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Rol</label>
              <select style={field} value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="agent">Agente</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Disponibilidad</label>
              <select style={field} value={form.availability} onChange={e => set('availability', e.target.value)}>
                <option value="online">En línea</option>
                <option value="busy">Ocupado</option>
                <option value="away">Ausente</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Máx. conversaciones</label>
              <input style={field} type="number" min="1" value={form.max_concurrent} onChange={e => set('max_concurrent', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Teléfono (opcional)</label>
              <input style={field} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+52 ..." />
            </div>
          </div>

          <div>
            <label style={label}>Canales asignados</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {channels.length === 0 ? (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No hay canales configurados.</span>
              ) : channels.map(ch => {
                const on = form.channel_ids.includes(ch.id)
                return (
                  <button key={ch.id} onClick={() => toggleChannel(ch.id)} type="button"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '5px 11px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.12s',
                      background: on ? 'var(--ink)' : 'transparent',
                      color: on ? 'var(--gold)' : 'var(--text-muted)',
                      border: `1px solid ${on ? 'var(--ink)' : 'var(--border)'}`,
                    }}>
                    {on && <Check size={10} />}
                    {CHANNEL_LABEL[ch.type] ?? ch.name}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 12px', background: 'var(--crimson-pale)', border: '1px solid rgba(122,28,42,0.2)', borderRadius: '8px' }}>
              <AlertTriangle size={13} style={{ color: 'var(--crimson)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--crimson)' }}>{error}</span>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
          <button onClick={onClose} className="btn-outline" style={{ padding: '8px 16px', fontSize: '12px' }}>Cancelar</button>
          <button onClick={submit} disabled={saving} className="btn-gold" style={{ padding: '8px 18px', fontSize: '12px', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
            {editing ? 'Guardar cambios' : 'Crear agente'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function Agents() {
  const [agents, setAgents]     = useState([])
  const [channels, setChannels] = useState([])
  const [me, setMe]             = useState(null)
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)   // null | {} (new) | agent (edit)
  const [confirm, setConfirm]   = useState(null)   // { agent, activate }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ags, chs, meData] = await Promise.all([
        getAgents().catch(() => []),
        listChannels().catch(() => []),
        getMe().catch(() => null),
      ])
      const chById = Object.fromEntries(chs.map(c => [c.id, c]))
      setAgents(ags.map(a => ({ ...a, _channels: (a.channel_ids ?? []).map(id => chById[id]).filter(Boolean) })))
      setChannels(chs)
      setMe(meData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const canManage = me?.permissions?.manage_agents ?? me?.is_superuser ?? false

  const handleSave = async (payload, id) => {
    if (id) await updateAgent(id, payload)
    else    await createAgent(payload)
    setModal(null)
    await load()
  }

  const handleToggle = async (agent, activate) => {
    if (activate) { await reactivateAgent(agent.id); await load() }
    else setConfirm({ agent, activate: false })
  }

  const confirmDeactivate = async () => {
    await deactivateAgent(confirm.agent.id)
    setConfirm(null)
    await load()
  }

  const active   = agents.filter(a => a.is_active)
  const inactive = agents.filter(a => !a.is_active)
  const online   = active.filter(a => a.availability === 'online').length

  return (
    <PageShell title="Agentes" subtitle="Equipo, roles, permisos y canales asignados">
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          {[
            { label: 'Agentes activos', value: active.length, color: 'var(--text)' },
            { label: 'En línea', value: online, color: 'var(--jade)' },
            { label: 'Dados de baja', value: inactive.length, color: 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label}>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums', fontFamily: "Georgia, serif" }}>{s.value}</p>
              <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
            </div>
          ))}
        </div>
        {canManage && (
          <button onClick={() => setModal({})} className="btn-gold" style={{ padding: '9px 16px', fontSize: '13px' }}>
            <Plus size={14} /> Agregar agente
          </button>
        )}
      </div>

      {!canManage && me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--gold-vp)', border: '1px solid rgba(192,155,58,0.2)', borderRadius: '8px', marginBottom: '16px' }}>
          <Shield size={13} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-mid)' }}>Vista de solo lectura — se requiere rol de administrador para gestionar el equipo.</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader size={22} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : agents.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <Users size={28} style={{ color: 'var(--border)', marginBottom: '10px' }} />
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Sin agentes aún</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>Agrega tu primer agente para empezar a distribuir conversaciones.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {[...active, ...inactive].map(agent => (
            <AgentCard key={agent.id} agent={agent} canManage={canManage} onEdit={setModal} onToggleActive={handleToggle} />
          ))}
        </div>
      )}

      {/* Permissions legend */}
      <div style={{ marginTop: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
        <p style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Permisos por rol
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '480px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>Capacidad</th>
                {['agent', 'supervisor', 'admin'].map(r => (
                  <th key={r} style={{ padding: '6px 10px' }}><RoleBadge role={r} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERM_LABELS).map(([key, lbl]) => {
                const map = {
                  agent:      { manage_agents: 0, configure_rules: 0, manage_channels: 0, view_all_convs: 0, reassign: 0, view_billing: 0, attend_convs: 1 },
                  supervisor: { manage_agents: 0, configure_rules: 0, manage_channels: 0, view_all_convs: 1, reassign: 1, view_billing: 0, attend_convs: 1 },
                  admin:      { manage_agents: 1, configure_rules: 1, manage_channels: 1, view_all_convs: 1, reassign: 1, view_billing: 1, attend_convs: 1 },
                }
                return (
                  <tr key={key} style={{ borderTop: '1px solid var(--sand)' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-mid)' }}>{lbl}</td>
                    {['agent', 'supervisor', 'admin'].map(r => (
                      <td key={r} style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {map[r][key]
                          ? <Check size={14} style={{ color: 'var(--jade)' }} />
                          : <span style={{ color: 'var(--border)' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <AgentModal
          agent={modal.id ? modal : null}
          channels={channels}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {confirm && (
        <div onClick={e => { if (e.target === e.currentTarget) setConfirm(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,23,40,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, animation: 'menuIn 0.15s' }}>
          <div style={{ width: '360px', background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '22px', boxShadow: '0 20px 60px rgba(11,23,40,0.22)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--crimson-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <UserX size={18} style={{ color: 'var(--crimson)' }} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: 'var(--text)', fontFamily: "Georgia, serif" }}>
              Dar de baja a {confirm.agent.name}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              El agente no podrá iniciar sesión ni recibir conversaciones. Su historial se conserva y puedes reactivarlo cuando quieras.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setConfirm(null)} className="btn-outline" style={{ padding: '8px 16px', fontSize: '12px' }}>Cancelar</button>
              <button onClick={confirmDeactivate} style={{ padding: '8px 18px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', background: 'var(--crimson)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Dar de baja
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
