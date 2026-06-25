import { useState } from 'react'
import { useAuth } from '../../store/auth'
import { Eye, EyeOff, Loader } from 'lucide-react'
import axios from 'axios'
import AlmenaraMark from '../../components/brand/AlmenaraMark'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const base = import.meta.env.VITE_API_URL || '/api'
      const { data } = await axios.post(`${base}/auth/token/`, { username, password })
      login(data.access, data.refresh)
    } catch (err) {
      setError(err.response?.data?.detail || 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Geometric background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: [
          'linear-gradient(rgba(192,155,58,0.06) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(192,155,58,0.06) 1px, transparent 1px)',
          'linear-gradient(45deg, rgba(192,155,58,0.025) 1px, transparent 1px)',
          'linear-gradient(-45deg, rgba(192,155,58,0.025) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '32px 32px, 32px 32px, 32px 32px, 32px 32px',
      }} />

      {/* Radial glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(192,155,58,0.06) 0%, transparent 70%)',
      }} />

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '18px',
        width: '100%',
        maxWidth: '396px',
        padding: '0',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
      }}>
        {/* Gold hairline crown */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, transparent, var(--gold) 45%, var(--gold-light) 55%, transparent)' }} />

        <div style={{ padding: '40px 36px 32px' }}>
          {/* Beacon hero — centered, glowing */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '26px' }}>
            <div style={{
              width: '76px', height: '76px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(circle at 50% 42%, rgba(192,155,58,0.16), transparent 70%)',
              marginBottom: '14px',
            }}>
              <AlmenaraMark size={58} tower="var(--gold)" light="var(--gold-light)" pulse />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: '22px', lineHeight: 1, letterSpacing: '6px', textTransform: 'uppercase', margin: 0, fontFamily: "Georgia, 'Palatino Linotype', serif", paddingLeft: '6px' }}>
              Almenara
            </p>
            <p style={{ color: 'var(--gold)', fontSize: '9.5px', letterSpacing: '3.5px', textTransform: 'uppercase', margin: '8px 0 0' }}>
              Plataforma Omnicanal
            </p>
          </div>

          {/* Hairline divider */}
          <div style={{ height: '1px', background: 'var(--border)', margin: '0 0 24px' }} />

          <h1 style={{
            margin: '0 0 4px', fontSize: '19px', fontWeight: 700, color: 'var(--text)',
            fontFamily: "Georgia, 'Palatino Linotype', 'Book Antiqua', serif", letterSpacing: '-0.2px',
          }}>
            Bienvenido de vuelta
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Ingresa a tu centro de operaciones
          </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '5px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              Usuario
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px', fontSize: '13px',
                border: '1px solid var(--border)',
                borderRadius: '8px', background: 'var(--sand)',
                color: 'var(--text)', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-mid)', marginBottom: '5px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '9px 36px 9px 12px', fontSize: '13px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', background: 'var(--sand)',
                  color: 'var(--text)', outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                style={{
                  position: 'absolute', right: '10px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 0,
                }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              fontSize: '12px', color: 'var(--crimson)',
              background: 'var(--crimson-pale)',
              border: '1px solid rgba(122,28,42,0.15)',
              borderRadius: '8px', padding: '8px 12px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn-gold"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', marginTop: '4px' }}
          >
            {loading && <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

          <p style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', marginTop: '22px', letterSpacing: '0.4px', opacity: 0.65 }}>
            Mensajería empresarial · cada canal, un solo faro
          </p>
        </div>
      </div>
    </div>
  )
}
