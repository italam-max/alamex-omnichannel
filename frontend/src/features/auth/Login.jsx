import { useState } from 'react'
import { useAuth } from '../../store/auth'
import { Eye, EyeOff, Loader } from 'lucide-react'
import axios from 'axios'

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
        borderRadius: '16px',
        width: '100%',
        maxWidth: '360px',
        padding: '36px 32px',
        position: 'relative',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute', inset: 0, transform: 'rotate(45deg)',
              borderRadius: '4px', background: 'var(--gold)', opacity: 0.18,
            }} />
            <div style={{
              position: 'absolute', inset: '4px', transform: 'rotate(45deg)',
              borderRadius: '3px', background: 'var(--gold)',
            }} />
            <span style={{ position: 'relative', zIndex: 1, color: 'var(--ink)', fontSize: '13px', fontWeight: 700 }}>A</span>
          </div>
          <div>
            <p style={{ color: 'var(--text)', fontWeight: 700, fontSize: '15px', lineHeight: 1.1, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Alamex</p>
            <p style={{ color: 'var(--gold)', fontSize: '9px', letterSpacing: '2.5px', textTransform: 'uppercase', margin: '2px 0 0' }}>Omnichannel</p>
          </div>
        </div>

        <h1 style={{
          margin: '0 0 4px',
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--text)',
          fontFamily: "Georgia, 'Palatino Linotype', 'Book Antiqua', serif",
          letterSpacing: '-0.3px',
        }}>
          Bienvenido
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Accede a tu plataforma
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

        <p style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', marginTop: '20px', opacity: 0.6 }}>
          Plataforma de mensajería empresarial · Alamex
        </p>
      </div>
    </div>
  )
}
