import { useState } from 'react'
import { useAuth } from '../../store/auth'
import { Bot, Eye, EyeOff, Loader } from 'lucide-react'
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
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">Alamex</p>
            <p className="text-xs text-gray-400">Omnichannel</p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-gray-800 mb-1">Bienvenido</h1>
        <p className="text-sm text-gray-400 mb-6">Accede a tu plataforma</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Usuario</label>
            <input
              value={username} onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Contraseña</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button
            type="submit" disabled={loading || !username || !password}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader size={14} className="animate-spin" />}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
