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
      <div
        className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-xs"
        style={isUser
          ? { borderRadius: '99px', background: 'var(--gold)', color: 'var(--ink)' }
          : {
              borderRadius: '99px',
              background: 'var(--ink)',
              border: '1.5px solid rgba(192,155,58,0.45)',
              color: 'var(--gold)',
              boxShadow: '0 0 8px rgba(192,155,58,0.25)',
            }}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div
        className="max-w-[75%] px-3.5 py-2.5 text-sm"
        style={isUser
          ? {
              borderRadius: '16px 16px 4px 16px',
              background: 'var(--sand-2)',
              color: 'var(--text)',
            }
          : {
              borderRadius: '16px 16px 16px 4px',
              background: 'var(--ink)',
              color: 'var(--gold-vp)',
              boxShadow: '0 2px 12px rgba(11,23,40,0.22), 0 0 0 1px rgba(192,155,58,0.22), 0 0 18px rgba(192,155,58,0.09)',
            }}
      >
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
        <div className="w-80 flex flex-col overflow-hidden" style={{ borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(11,23,40,0.28)' }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: 'var(--ink)', borderBottom: '1px solid rgba(192,155,58,0.3)' }}>
            <div className="w-8 h-8 flex items-center justify-center" style={{ borderRadius: '99px', background: 'rgba(192,155,58,0.18)', border: '1px solid rgba(192,155,58,0.4)' }}>
              <Bot size={16} style={{ color: 'var(--gold)' }} />
            </div>
            <p className="text-sm font-semibold flex-1" style={{ color: 'var(--gold-vp)' }}>{config?.header_title || 'Chatea con nosotros'}</p>
            <button onClick={() => setOpen(false)} aria-label="Cerrar chat" className="transition-colors" style={{ color: 'rgba(251,247,238,0.7)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages / name step */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'var(--sand)' }}>
            {nameStep ? (
              <div className="space-y-3">
                <div className="px-3.5 py-2.5 text-sm" style={{ borderRadius: '16px 16px 16px 4px', background: 'var(--ink)', color: 'var(--gold-vp)', boxShadow: '0 2px 12px rgba(11,23,40,0.22), 0 0 0 1px rgba(192,155,58,0.22), 0 0 18px rgba(192,155,58,0.09)' }}>
                  ¡Hola! Antes de continuar, ¿cuál es tu nombre?
                </div>
                <div className="flex gap-2">
                  <input value={visitorName} onChange={e => setVisitorName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmName()}
                    placeholder="Tu nombre"
                    className="flex-1 px-3 py-2 text-sm focus:outline-none"
                    style={{ borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  <button onClick={confirmName}
                    className="px-3 py-2 text-sm font-medium transition-colors"
                    style={{ borderRadius: '12px', background: 'var(--gold)', color: 'var(--ink)' }}>
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
                {sending && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 flex items-center justify-center" style={{ borderRadius: '99px', background: 'var(--ink)', border: '1.5px solid rgba(192,155,58,0.45)', color: 'var(--gold)', boxShadow: '0 0 8px rgba(192,155,58,0.25)' }}>
                      <Bot size={13} />
                    </div>
                    <div className="px-3.5 py-2.5" style={{ borderRadius: '16px 16px 16px 4px', background: 'var(--ink)', boxShadow: '0 2px 12px rgba(11,23,40,0.22), 0 0 0 1px rgba(192,155,58,0.22), 0 0 18px rgba(192,155,58,0.09)' }}>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 animate-bounce" style={{ borderRadius: '99px', background: 'var(--gold)', animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 animate-bounce" style={{ borderRadius: '99px', background: 'var(--gold)', animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 animate-bounce" style={{ borderRadius: '99px', background: 'var(--gold)', animationDelay: '300ms' }} />
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
            <div className="px-3 py-2.5" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                  style={{ borderRadius: '12px', background: 'var(--sand)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  aria-label="Enviar mensaje"
                  className="w-8 h-8 flex items-center justify-center transition-colors disabled:opacity-40"
                  style={{ borderRadius: '12px', background: 'var(--gold)', color: 'var(--ink)', boxShadow: '0 0 10px rgba(192,155,58,0.25)' }}>
                  <Send size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Launcher */}
      <button onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
        className="w-13 h-13 w-14 h-14 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ borderRadius: '99px', background: 'var(--ink)', color: 'var(--gold)', border: '1.5px solid rgba(192,155,58,0.45)', boxShadow: '0 6px 24px rgba(11,23,40,0.3), 0 0 18px rgba(192,155,58,0.18)' }}>
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
        <div className="p-5 mb-5" style={{ borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(11,23,40,0.04)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-mid)' }}>Widget Key</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Encuéntralo en <strong>Canales → tu canal Website → ver configuración</strong>.
            Formato: <code className="px-1" style={{ borderRadius: '4px', background: 'var(--sand-2)', color: 'var(--text-mid)' }}>web_xxxx</code>
          </p>
          <div className="flex gap-2">
            <input value={inputKey} onChange={e => setInputKey(e.target.value)}
              placeholder="web_5c9102c541a6996b..."
              className="flex-1 px-3 py-2 text-sm font-mono focus:outline-none"
              style={{ borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <button onClick={loadConfig} disabled={!inputKey.trim()}
              className="px-4 py-2 disabled:opacity-40 text-sm font-medium transition-colors"
              style={{ borderRadius: '8px', background: 'var(--gold)', color: 'var(--ink)' }}>
              Cargar
            </button>
          </div>
          {loadError && <p className="text-xs mt-2" style={{ color: 'var(--crimson)' }}>{loadError}</p>}
        </div>

        {config && (
          <div className="p-4 text-sm" style={{ borderRadius: '12px', background: 'var(--jade-pale)', border: '1px solid rgba(26,92,58,0.25)', color: 'var(--jade)' }}>
            ✓ Widget cargado — aparece en la esquina inferior derecha de esta página.
            <br />
            <span className="text-xs mt-1 block" style={{ color: 'var(--jade)', opacity: 0.85 }}>
              Todos los mensajes quedan guardados en el Inbox.
            </span>
          </div>
        )}
      </div>

      {widgetKey && <LiveWidget widgetKey={widgetKey} config={config} />}
    </PageShell>
  )
}
