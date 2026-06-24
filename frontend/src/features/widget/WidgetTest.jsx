import { useState, useRef, useEffect } from 'react'
import PageShell from '../../components/layout/PageShell'
import { Send, Bot, User, MessageSquare, X } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const SESSION_KEY = 'alamex_widget_session'

function getStoredSessionId() {
  return localStorage.getItem(SESSION_KEY) || ''
}

function storeSessionId(id) {
  localStorage.setItem(SESSION_KEY, id)
}

function renderMarkdown(text) {
  // Bold, line breaks — no external dependency
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

function ChatBubble({ msg }) {
  const isUser = msg.role === 'customer'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
        isUser ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-purple-500'
      }`}>
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
        isUser ? 'bg-amber-500 text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm'
      }`}>
        {isUser
          ? msg.content
          : <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
      </div>
    </div>
  )
}

function LiveWidget({ widgetKey, config }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [visitorName, setVisitorName] = useState(localStorage.getItem('widget_name') || '')
  const [nameStep, setNameStep] = useState(!visitorName)
  const endRef = useRef(null)
  const [sessionId, setSessionId] = useState(getStoredSessionId)
  const accent = config?.accent_color || '#e7a518'

  useEffect(() => {
    if (open && messages.length === 0 && !nameStep) {
      setMessages([{ id: 0, role: 'ai', content: config?.greeting_message || '¡Hola! ¿En qué puedo ayudarte?' }])
    }
  }, [open])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const confirmName = () => {
    if (!visitorName.trim()) return
    localStorage.setItem('widget_name', visitorName.trim())
    setNameStep(false)
    setMessages([{ id: 0, role: 'ai', content: config?.greeting_message || '¡Hola! ¿En qué puedo ayudarte?' }])
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    const userMsg = { id: Date.now(), role: 'customer', content: text }
    setMessages(ms => [...ms, userMsg])
    setSending(true)
    try {
      const resp = await fetch(`${API_BASE}/integrations/widget/${widgetKey}/message/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, visitor_name: visitorName, message: text }),
      })
      const data = await resp.json()
      // Always use the server-returned session_id as the authoritative one
      if (data.session_id) {
        storeSessionId(data.session_id)
        setSessionId(data.session_id)
      }
      setMessages(ms => [...ms, { id: Date.now() + 1, role: 'ai', content: data.reply || '...' }])
    } catch {
      setMessages(ms => [...ms, { id: Date.now() + 1, role: 'ai', content: 'Error de conexión. Intenta de nuevo.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat window */}
      {open && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden" style={{ height: '460px' }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2.5" style={{ backgroundColor: accent }}>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <p className="text-white text-sm font-semibold flex-1">{config?.header_title || 'Chatea con nosotros'}</p>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Messages / name step */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {nameStep ? (
              <div className="space-y-3">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-gray-700 shadow-sm">
                  ¡Hola! Antes de continuar, ¿cuál es tu nombre?
                </div>
                <div className="flex gap-2">
                  <input value={visitorName} onChange={e => setVisitorName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmName()}
                    placeholder="Tu nombre"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
                  <button onClick={confirmName}
                    className="px-3 py-2 text-sm text-white rounded-xl font-medium transition-colors"
                    style={{ backgroundColor: accent }}>
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
                {sending && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-purple-500">
                      <Bot size={13} />
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </>
            )}
          </div>

          {/* Input */}
          {!nameStep && (
            <div className="px-3 py-2.5 bg-white border-t border-gray-100">
              <div className="flex items-center gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white transition-colors disabled:opacity-40"
                  style={{ backgroundColor: accent }}>
                  <Send size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Launcher */}
      <button onClick={() => setOpen(o => !o)}
        className="w-13 h-13 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
        style={{ backgroundColor: accent }}>
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>
    </div>
  )
}

export default function WidgetTest() {
  const [widgetKey, setWidgetKey] = useState('')
  const [inputKey, setInputKey] = useState('')
  const [config, setConfig] = useState(null)
  const [loadError, setLoadError] = useState('')

  const loadConfig = async () => {
    setLoadError('')
    try {
      const resp = await fetch(`${API_BASE}/integrations/widget/${inputKey}/config/`)
      if (!resp.ok) throw new Error('Widget no encontrado')
      const data = await resp.json()
      setConfig(data)
      setWidgetKey(inputKey)
    } catch (e) {
      setLoadError(e.message)
    }
  }

  return (
    <PageShell title="Prueba del Widget" subtitle="Simula el chat tal como lo verá un visitante en el sitio web">
      <div className="max-w-xl">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Widget Key</p>
          <p className="text-xs text-gray-400 mb-3">
            Encuéntralo en <strong>Canales → tu canal Website → ver configuración</strong>.
            Formato: <code className="bg-gray-100 px-1 rounded">web_xxxx</code>
          </p>
          <div className="flex gap-2">
            <input value={inputKey} onChange={e => setInputKey(e.target.value)}
              placeholder="web_5c9102c541a6996b..."
              className="flex-1 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <button onClick={loadConfig} disabled={!inputKey.trim()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
              Cargar
            </button>
          </div>
          {loadError && <p className="text-xs text-red-500 mt-2">{loadError}</p>}
        </div>

        {config && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700">
            ✓ Widget cargado — aparece en la esquina inferior derecha de esta página.
            <br />
            <span className="text-xs text-emerald-600 mt-1 block">
              Todos los mensajes quedan guardados en el Inbox.
            </span>
          </div>
        )}
      </div>

      {widgetKey && <LiveWidget widgetKey={widgetKey} config={config} />}
    </PageShell>
  )
}
