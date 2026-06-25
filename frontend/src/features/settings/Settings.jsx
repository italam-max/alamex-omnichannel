import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Key, CheckCircle, XCircle,
  Loader, Save, AlertTriangle, ArrowUpCircle, Clock,
  CreditCard, SlidersHorizontal
} from 'lucide-react'
import { getAccount, updateAccount, topup, getTransactions, getUsageStats } from '../../services/billing'
import BusinessRules from './BusinessRules'

// ── Model labels ──────────────────────────────────────────────────

const MODEL_LABELS = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-sonnet-4-6':         'Sonnet 4.6',
  'claude-opus-4-8':           'Opus 4.8',
}

// ── Helpers ───────────────────────────────────────────────────────

function fmt(n) {
  return parseFloat(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// ── Balance display ───────────────────────────────────────────────

function BalanceCard({ balance, isLow, threshold }) {
  const empty = parseFloat(balance) <= 0
  const color = empty ? 'var(--crimson)' : isLow ? '#D97706' : 'var(--jade)'
  const bg    = empty ? 'var(--crimson-pale)' : isLow ? '#FFFBEB' : 'var(--jade-pale)'
  const bdr   = empty ? 'rgba(122,28,42,0.2)' : isLow ? 'rgba(217,119,6,0.2)' : 'rgba(26,92,58,0.2)'

  return (
    <div style={{
      borderRadius: '12px', border: `1px solid ${bdr}`,
      padding: '20px', background: bg,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '6px' }}>Saldo disponible</p>
          <p style={{ fontSize: '36px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, margin: 0, fontFamily: "Georgia, serif" }}>
            ${fmt(balance)}
            <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>USD</span>
          </p>
        </div>
        <CreditCard size={22} style={{ color }} />
      </div>
      {empty && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--crimson)', fontWeight: 500 }}>
          <XCircle size={13} /> Sin créditos — el agente IA no responderá
        </div>
      )}
      {!empty && isLow && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#92400E', fontWeight: 500 }}>
          <AlertTriangle size={13} /> Saldo bajo — alerta configurada en ${fmt(threshold)} USD
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '8px',
        background: 'var(--gold-pale)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={15} style={{ color: 'var(--gold)' }} />
      </div>
      <div>
        <h2 style={{
          margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)',
          fontFamily: "Georgia, 'Palatino Linotype', serif",
        }}>{label}</h2>
        {sub && <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Settings() {
  const [account, setAccount]       = useState(null)
  const [txs, setTxs]               = useState([])
  const [usage, setUsage]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [savingCfg, setSavingCfg]   = useState(false)
  const [cfgStatus, setCfgStatus]   = useState(null)

  // Billing config editable fields
  const [markup, setMarkup]         = useState('')
  const [alertThreshold, setAlertThreshold] = useState('')

  // Top-up form
  const [topupAmt, setTopupAmt]     = useState('')
  const [topupDesc, setTopupDesc]   = useState('')
  const [toppingUp, setToppingUp]   = useState(false)
  const [topupStatus, setTopupStatus] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [acc, transactions, usageStats] = await Promise.all([
        getAccount(), getTransactions(), getUsageStats()
      ])
      setAccount(acc)
      setMarkup(String(acc.markup_multiplier))
      setAlertThreshold(String(acc.alert_threshold_usd))
      setTxs(transactions)
      setUsage(usageStats)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaveCfg = async () => {
    setSavingCfg(true)
    setCfgStatus(null)
    try {
      const updated = await updateAccount({
        markup_multiplier:   parseFloat(markup),
        alert_threshold_usd: parseFloat(alertThreshold),
      })
      setAccount(updated)
      setCfgStatus('ok')
      setTimeout(() => setCfgStatus(null), 3000)
    } catch {
      setCfgStatus('error')
      setTimeout(() => setCfgStatus(null), 4000)
    } finally {
      setSavingCfg(false)
    }
  }

  const handleTopup = async () => {
    const amt = parseFloat(topupAmt)
    if (!amt || amt <= 0) return
    setToppingUp(true)
    setTopupStatus(null)
    try {
      const tx = await topup(amt, topupDesc || `Recarga manual $${amt} USD`)
      setTxs(prev => [tx, ...prev])
      setAccount(prev => ({ ...prev, balance_usd: String(parseFloat(prev.balance_usd) + amt) }))
      setTopupAmt('')
      setTopupDesc('')
      setTopupStatus('ok')
      setTimeout(() => setTopupStatus(null), 3000)
    } catch {
      setTopupStatus('error')
      setTimeout(() => setTopupStatus(null), 4000)
    } finally {
      setToppingUp(false)
    }
  }

  if (loading) {
    return (
      <PageShell title="Ajustes" subtitle="Proveedor de IA · Créditos · Historial">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px' }}>
          <Loader size={22} style={{ color: 'var(--border)', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageShell>
    )
  }

  const keyConfigured = account?.anthropic_key_configured

  return (
    <PageShell title="Ajustes" subtitle="Reglas de negocio · Proveedor de IA · Créditos">
      <div className="max-w-3xl space-y-8">

        {/* ── REGLAS DE NEGOCIO (SLA / alertas / anti-spam) ────── */}
        <section>
          <SectionHeader icon={SlidersHorizontal} label="Reglas de negocio" sub="SLA, escalada por correo y filtro anti-spam — sin tocar código" />
          <BusinessRules />
        </section>

        {/* ── PROVEEDOR DE IA ──────────────────────────────────── */}
        <section>
          <SectionHeader icon={Key} label="Proveedor de IA" sub="API key de Anthropic — configurada en el servidor (.env)" />
          <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '20px',
          boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
          display: 'flex', flexDirection: 'column', gap: '18px',
        }}>
            {/* Key status */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: '8px',
              background: 'var(--sand)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: keyConfigured ? '#10B981' : 'var(--crimson)' }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-mid)', fontFamily: 'monospace' }}>ANTHROPIC_API_KEY</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {keyConfigured
                  ? <><CheckCircle size={13} style={{ color: '#10B981' }} /><span style={{ fontSize: '11px', color: '#065F46', fontWeight: 600 }}>Configurada</span></>
                  : <><XCircle size={13} style={{ color: 'var(--crimson)' }} /><span style={{ fontSize: '11px', color: 'var(--crimson)', fontWeight: 600 }}>No configurada</span></>
                }
              </div>
            </div>
            {!keyConfigured && (
              <div style={{
                padding: '10px 12px', background: '#FFFBEB', borderRadius: '8px',
                fontSize: '12px', color: '#92400E', border: '1px solid rgba(217,119,6,0.2)',
              }}>
                Agrega <code style={{ background: 'rgba(217,119,6,0.15)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>ANTHROPIC_API_KEY=sk-ant-...</code> al archivo{' '}
                <code style={{ background: 'rgba(217,119,6,0.15)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>.env</code> del servidor y reinicia Django.
              </div>
            )}

            {/* Pricing table */}
            <div>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Precios con multiplicador ×{markup}
              </p>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--sand)' }}>
                    <tr>
                      {['Modelo', 'Entrada /1M', 'Salida /1M', 'Cobras'].map((h, i) => (
                        <th key={h} style={{
                          padding: '8px 14px', color: 'var(--text-muted)', fontWeight: 600,
                          textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid var(--border)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {account?.pricing && Object.entries(account.pricing).map(([model, p]) => (
                      <tr key={model} style={{ borderBottom: '1px solid var(--sand-2)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-mid)' }}>{MODEL_LABELS[model] || model}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>${p.input_per_1m_anthropic}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>${p.output_per_1m_anthropic}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
                          ${p.input_per_1m_charged} / ${p.output_per_1m_charged}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Multiplicador de precio
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--sand)' }}>
                  <span style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: '13px' }}>×</span>
                  <input type="number" min="1" step="0.5" value={markup}
                    onChange={e => setMarkup(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px 8px 0', fontSize: '13px', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                </div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Aplica sobre el costo real de Anthropic</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Alerta de saldo bajo
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--sand)' }}>
                  <span style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: '13px' }}>$</span>
                  <input type="number" min="0" step="1" value={alertThreshold}
                    onChange={e => setAlertThreshold(e.target.value)}
                    style={{ flex: 1, padding: '8px 4px', fontSize: '13px', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                  <span style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: '11px' }}>USD</span>
                </div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Muestra alerta cuando el saldo baja de aquí</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleSaveCfg} disabled={savingCfg} className="btn-gold">
                {savingCfg ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : cfgStatus === 'ok' ? <CheckCircle size={13} />
                  : cfgStatus === 'error' ? <XCircle size={13} />
                  : <Save size={13} />}
                {cfgStatus === 'ok' ? 'Guardado' : cfgStatus === 'error' ? 'Error' : 'Guardar'}
              </button>
            </div>
          </div>
        </section>

        {/* ── CRÉDITOS ─────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={CreditCard} label="Saldo y créditos"
            sub="Cada mensaje de IA consume créditos proporcionales al uso de tokens" />
          <div className="space-y-4">
            <BalanceCard
              balance={account?.balance_usd || '0'}
              isLow={account?.is_low}
              threshold={account?.alert_threshold_usd}
            />

            {/* Top-up form */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '20px',
              boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
            }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Agregar créditos</p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', width: '130px', background: 'var(--sand)' }}>
                  <span style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: '13px' }}>$</span>
                  <input type="number" min="1" step="1" value={topupAmt}
                    onChange={e => setTopupAmt(e.target.value)}
                    placeholder="50"
                    style={{ flex: 1, padding: '8px 6px', fontSize: '13px', border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                </div>
                <input value={topupDesc} onChange={e => setTopupDesc(e.target.value)}
                  placeholder="Ej. Pago cliente enero 2026"
                  style={{
                    flex: 1, padding: '8px 12px', fontSize: '13px',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    background: 'var(--sand)', color: 'var(--text)', outline: 'none',
                  }} />
                <button onClick={handleTopup} disabled={toppingUp || !topupAmt || parseFloat(topupAmt) <= 0}
                  className="btn-gold" style={{ whiteSpace: 'nowrap', background: 'var(--jade)' }}>
                  {toppingUp ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowUpCircle size={13} />}
                  {topupStatus === 'ok' ? '¡Agregado!' : topupStatus === 'error' ? 'Error' : 'Agregar'}
                </button>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Top-up manual — cuando integres pagos (Stripe, etc.) esto se automatizará.
              </p>
            </div>

            {/* Usage stats */}
            {usage.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '20px',
                boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
              }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Consumo últimos 30 días por modelo</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {usage.map(u => (
                    <div key={u.model_used} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-mid)' }}>{MODEL_LABELS[u.model_used] || u.model_used || 'Desconocido'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        <span>{u.messages?.toLocaleString()} mensajes</span>
                        <span>{((u.total_input || 0) + (u.total_output || 0)).toLocaleString()} tokens</span>
                        <span style={{ color: 'var(--crimson)', fontWeight: 600 }}>−${fmt(Math.abs(u.total_cost || 0))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── HISTORIAL ────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={Clock} label="Historial de transacciones" sub="Últimas 50 — recargas y consumos" />
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(11,23,40,0.04)',
          }}>
            {txs.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <Clock size={22} style={{ color: 'var(--border)', margin: '0 auto 8px' }} />
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sin transacciones todavía</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--sand)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      {['Fecha', 'Descripción', 'Modelo', 'Tokens', 'Monto', 'Saldo'].map((h, i) => (
                        <th key={h} style={{
                          padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600,
                          textAlign: i < 3 ? 'left' : 'right',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map(tx => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid var(--sand-2)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(tx.created_at)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-mid)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{tx.model_used ? (MODEL_LABELS[tx.model_used] || tx.model_used) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {tx.input_tokens || tx.output_tokens
                            ? (tx.input_tokens + tx.output_tokens).toLocaleString()
                            : '—'}
                        </td>
                        <td style={{
                          padding: '10px 14px', textAlign: 'right', fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                          color: tx.type === 'topup' ? 'var(--jade)' : 'var(--crimson)',
                        }}>
                          {tx.type === 'topup' ? '+' : '−'}${fmt(Math.abs(tx.amount_usd))}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>${fmt(tx.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <div className="h-8" />
      </div>
    </PageShell>
  )
}
