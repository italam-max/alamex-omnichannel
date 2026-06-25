import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Eye, EyeOff, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { getInvite, acceptInvite } from '../../services/operator'
import AlmenaraMark from '../../components/brand/AlmenaraMark'

export default function Activate() {
  const { token } = useParams()
  const { login } = useAuth()
  const [invite, setInvite] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | invalid
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getInvite(token)
      .then(d => { setInvite(d); setState('ready') })
      .catch(() => setState('invalid'))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pw.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (pw !== pw2) return setError('Las contraseñas no coinciden.')
    setSubmitting(true)
    try {
      const { access, refresh } = await acceptInvite(token, pw)
      login(access, refresh)            // logs in and enters the app
      window.location.href = '/'
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo activar la cuenta.')
      setSubmitting(false)
    }
  }

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '404px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '18px', overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ height: '3px', background: 'var(--beam)' }} />
        <div style={{ padding: '40px 36px 32px' }}>{children}</div>
      </div>
    </div>
  )

  const hero = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '22px' }}>
      <AlmenaraMark size={54} tower="var(--gold)" light="var(--gold-light)" pulse />
      <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: '20px', letterSpacing: '5px',
        textTransform: 'uppercase', margin: '12px 0 0', fontFamily: 'var(--font-display)' }}>Almenara</p>
    </div>
  )

  if (state === 'loading')
    return shell(<div style={{ textAlign: 'center', padding: '20px' }}><Loader size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>)

  if (state === 'invalid')
    return shell(<>{hero}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px',
        background: 'var(--crimson-pale)', borderRadius: '10px', color: 'var(--crimson)', fontSize: '13px' }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
        Esta liga de acceso es inválida o ya expiró. Pide a tu proveedor una nueva.
      </div></>)

  return shell(<>
    {hero}
    <div style={{ height: '1px', background: 'var(--border)', margin: '0 0 22px' }} />
    <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
      Activa tu cuenta
    </h1>
    <p style={{ margin: '4px 0 22px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
      {invite.organization} · {invite.email}
    </p>
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label className="kb-label">Crea tu contraseña</label>
        <div style={{ position: 'relative' }}>
          <input type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
            placeholder="Mínimo 8 caracteres" autoFocus className="kb-input" style={{ paddingRight: '36px' }} />
          <button type="button" onClick={() => setShowPw(s => !s)} aria-label="Mostrar contraseña"
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div>
        <label className="kb-label">Confírmala</label>
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
          placeholder="Repite la contraseña" className="kb-input" />
      </div>
      {error && (
        <div style={{ fontSize: '12px', color: 'var(--crimson)', background: 'var(--crimson-pale)',
          borderRadius: '8px', padding: '8px 12px' }}>{error}</div>
      )}
      <button type="submit" disabled={submitting || !pw || !pw2} className="btn-gold"
        style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', marginTop: '4px' }}>
        {submitting ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={14} />}
        {submitting ? 'Activando…' : 'Activar y entrar'}
      </button>
    </form>
  </>)
}
