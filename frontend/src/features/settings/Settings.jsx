import { useState, useEffect, useCallback } from 'react'
import PageShell from '../../components/layout/PageShell'
import {
  Key, Zap, TrendingDown, Plus, CheckCircle, XCircle,
  Loader, Save, AlertTriangle, ArrowUpCircle, Clock,
  CreditCard, Settings2
} from 'lucide-react'
import { getAccount, updateAccount, topup, getTransactions, getUsageStats } from '../../services/billing'

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
  const color = parseFloat(balance) <= 0
    ? 'text-red-500'
    : isLow
    ? 'text-amber-500'
    : 'text-emerald-500'

  const bg = parseFloat(balance) <= 0
    ? 'bg-red-50 border-red-100'
    : isLow
    ? 'bg-amber-50 border-amber-100'
    : 'bg-emerald-50 border-emerald-100'

  return (
    <div className={`rounded-xl border p-5 ${bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Saldo disponible</p>
          <p className={`text-4xl font-bold tabular-nums ${color}`}>
            ${fmt(balance)}
            <span className="text-base font-normal text-gray-400 ml-1">USD</span>
          </p>
        </div>
        <CreditCard size={24} className={color} />
      </div>
      {parseFloat(balance) <= 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600 font-medium">
          <XCircle size={13} /> Sin créditos — el agente IA no responderá
        </div>
      )}
      {parseFloat(balance) > 0 && isLow && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 font-medium">
          <AlertTriangle size={13} /> Saldo bajo — alerta configurada en ${fmt(threshold)} USD
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, sub }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
        <Icon size={15} className="text-blue-500" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
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
        <div className="flex items-center justify-center h-48">
          <Loader size={24} className="animate-spin text-gray-300" />
        </div>
      </PageShell>
    )
  }

  const keyConfigured = account?.anthropic_key_configured

  return (
    <PageShell title="Ajustes" subtitle="Proveedor de IA · Créditos · Historial">
      <div className="max-w-3xl space-y-8">

        {/* ── PROVEEDOR DE IA ──────────────────────────────────── */}
        <section>
          <SectionHeader icon={Key} label="Proveedor de IA" sub="API key de Anthropic — configurada en el servidor (.env)" />
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-5">

            {/* Key status */}
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${keyConfigured ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-gray-700">ANTHROPIC_API_KEY</span>
              </div>
              <div className="flex items-center gap-2">
                {keyConfigured
                  ? <><CheckCircle size={13} className="text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Configurada</span></>
                  : <><XCircle size={13} className="text-red-400" /><span className="text-xs text-red-500 font-medium">No configurada</span></>
                }
              </div>
            </div>
            {!keyConfigured && (
              <div className="px-3 py-2.5 bg-amber-50 rounded-lg text-xs text-amber-700 border border-amber-100">
                Agrega <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> al archivo{' '}
                <code className="bg-amber-100 px-1 rounded">.env</code> del servidor y reinicia Django.
              </div>
            )}

            {/* Pricing table */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Precios con multiplicador ×{markup}</p>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-500 font-medium">Modelo</th>
                      <th className="text-right px-4 py-2 text-gray-500 font-medium">Entrada /1M</th>
                      <th className="text-right px-4 py-2 text-gray-500 font-medium">Salida /1M</th>
                      <th className="text-right px-4 py-2 text-gray-500 font-medium">Cobras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {account?.pricing && Object.entries(account.pricing).map(([model, p]) => (
                      <tr key={model} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{MODEL_LABELS[model] || model}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">${p.input_per_1m_anthropic}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">${p.output_per_1m_anthropic}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-blue-600">
                          ${p.input_per_1m_charged} / ${p.output_per_1m_charged}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Multiplicador de precio</label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-400">
                  <span className="px-3 text-gray-400 text-sm">×</span>
                  <input type="number" min="1" step="0.5" value={markup}
                    onChange={e => setMarkup(e.target.value)}
                    className="flex-1 py-2 pr-3 text-sm focus:outline-none" />
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">Aplica sobre el costo real de Anthropic</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Alerta de saldo bajo</label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-400">
                  <span className="px-3 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="1" value={alertThreshold}
                    onChange={e => setAlertThreshold(e.target.value)}
                    className="flex-1 py-2 pr-3 text-sm focus:outline-none" />
                  <span className="pr-3 text-gray-400 text-xs">USD</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">Muestra alerta cuando el saldo baja de aquí</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleSaveCfg} disabled={savingCfg}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                {savingCfg ? <Loader size={13} className="animate-spin" />
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
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-700 mb-3">Agregar créditos</p>
              <div className="flex gap-3 items-start">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-400 w-36">
                  <span className="px-3 text-gray-400 text-sm">$</span>
                  <input type="number" min="1" step="1" value={topupAmt}
                    onChange={e => setTopupAmt(e.target.value)}
                    placeholder="50"
                    className="flex-1 py-2 pr-2 text-sm focus:outline-none" />
                </div>
                <input value={topupDesc} onChange={e => setTopupDesc(e.target.value)}
                  placeholder="Ej. Pago cliente enero 2026"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                <button onClick={handleTopup} disabled={toppingUp || !topupAmt || parseFloat(topupAmt) <= 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap">
                  {toppingUp ? <Loader size={13} className="animate-spin" /> : <ArrowUpCircle size={13} />}
                  {topupStatus === 'ok' ? '¡Agregado!' : topupStatus === 'error' ? 'Error' : 'Agregar'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Top-up manual — cuando integres pagos (Stripe, etc.) esto se automatizará.
              </p>
            </div>

            {/* Usage stats */}
            {usage.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-700 mb-3">Consumo últimos 30 días por modelo</p>
                <div className="space-y-2">
                  {usage.map(u => (
                    <div key={u.model_used} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">{MODEL_LABELS[u.model_used] || u.model_used || 'Desconocido'}</span>
                      <div className="flex items-center gap-4 text-gray-400">
                        <span>{u.messages?.toLocaleString()} mensajes</span>
                        <span>{((u.total_input || 0) + (u.total_output || 0)).toLocaleString()} tokens</span>
                        <span className="text-red-500 font-medium">−${fmt(Math.abs(u.total_cost || 0))}</span>
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
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {txs.length === 0 ? (
              <div className="py-10 text-center">
                <Clock size={24} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin transacciones todavía</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Descripción</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">Modelo</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">Tokens</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">Monto</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {txs.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{tx.description || '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{tx.model_used ? (MODEL_LABELS[tx.model_used] || tx.model_used) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                          {tx.input_tokens || tx.output_tokens
                            ? `${(tx.input_tokens + tx.output_tokens).toLocaleString()}`
                            : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium tabular-nums ${
                          tx.type === 'topup' ? 'text-emerald-600' : 'text-red-500'
                        }`}>
                          {tx.type === 'topup' ? '+' : '−'}${fmt(Math.abs(tx.amount_usd))}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 tabular-nums">${fmt(tx.balance_after)}</td>
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
