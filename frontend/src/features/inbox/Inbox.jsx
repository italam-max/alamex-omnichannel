import { useState, useEffect, useRef } from 'react'
import { mockConversations, mockMessages } from '../../mocks/conversations'
import { getConversations, getConversation, sendAgentMessage, toggleAiActive } from '../../services/conversations'
import PageShell from '../../components/layout/PageShell'
import ChannelBadge from '../../components/ui/ChannelBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { Bot, User, Search, Filter, Send, ToggleLeft, ToggleRight, Loader, RefreshCw } from 'lucide-react'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function ConversationItem({ conv, active, onClick }) {
  const name = conv.contact?.name ?? conv.contact_name ?? 'Sin nombre'
  const channelType = conv.channel?.type ?? conv.channel_type ?? 'whatsapp'
  const lastMsg = conv.last_message ?? conv.messages?.[conv.messages.length - 1]?.content ?? '—'
  const updatedAt = conv.updated_at ?? conv.created_at

  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors ${active ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
            {updatedAt && <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{timeAgo(updatedAt)}</span>}
          </div>
          <p className="text-xs text-gray-500 truncate mb-1.5">{lastMsg}</p>
          <div className="flex items-center gap-1.5">
            <ChannelBadge type={channelType} />
            <StatusBadge status={conv.status} />
          </div>
        </div>
      </div>
    </button>
  )
}

function renderMd(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
}

function MessageBubble({ msg }) {
  const isCustomer = msg.role === 'customer'
  const isAi = msg.role === 'ai'
  return (
    <div className={`flex gap-2 ${isCustomer ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
        isCustomer ? 'bg-blue-500 text-white' : isAi ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-700'
      }`}>
        {isAi ? <Bot size={14} /> : <User size={14} />}
      </div>
      <div className={`max-w-[72%] flex flex-col gap-1 ${isCustomer ? 'items-end' : 'items-start'}`}>
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isCustomer
            ? 'bg-blue-500 text-white rounded-tr-sm'
            : isAi
            ? 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm'
            : 'bg-amber-50 border border-amber-200 text-gray-700 rounded-tl-sm'
        }`}>
          {isAi
            ? <span dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
            : msg.content}
        </div>
        {isAi && msg.model_used && (
          <span className="text-[10px] text-purple-400 px-1">IA · {msg.model_used}</span>
        )}
      </div>
    </div>
  )
}

export default function Inbox() {
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [newMsg, setNewMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  const loadConversations = async () => {
    setLoadingConvs(true)
    setError('')
    try {
      const data = USE_MOCK ? mockConversations : await getConversations()
      setConversations(data)
      if (data.length && !selected) setSelected(data[0])
    } catch (e) {
      setError('No se pudo conectar al backend — usando datos de prueba')
      setConversations(mockConversations)
      if (!selected) setSelected(mockConversations[0])
    } finally {
      setLoadingConvs(false)
    }
  }

  const loadMessages = async (conv) => {
    setLoadingMsgs(true)
    try {
      if (USE_MOCK) {
        setMessages(mockMessages.filter(m => m.conversation === conv.id))
      } else {
        const detail = await getConversation(conv.id)
        setMessages(detail.messages ?? [])
      }
    } catch {
      setMessages(mockMessages.filter(m => m.conversation === conv.id))
    } finally {
      setLoadingMsgs(false)
    }
  }

  useEffect(() => { loadConversations() }, [])

  // Poll for new messages every 5s when a conversation is selected
  useEffect(() => {
    if (!selected || USE_MOCK) return
    const interval = setInterval(async () => {
      try {
        const detail = await getConversation(selected.id)
        setMessages(detail.messages ?? [])
      } catch { /* silently ignore poll errors */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [selected?.id])

  useEffect(() => { if (selected) loadMessages(selected) }, [selected])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    const text = newMsg.trim()
    if (!text || !selected || sendingMsg) return
    setSendingMsg(true)
    setNewMsg('')
    try {
      const msg = await sendAgentMessage(selected.id, text)
      setMessages(ms => [...ms, msg])
    } catch {
      setNewMsg(text)
    } finally {
      setSendingMsg(false)
    }
  }

  const handleToggleAi = async (conv) => {
    try {
      const updated = await toggleAiActive(conv.id, !conv.ai_active)
      setConversations(cs => cs.map(c => c.id === updated.id ? { ...c, ai_active: updated.ai_active } : c))
      if (selected?.id === updated.id) setSelected(s => ({ ...s, ai_active: updated.ai_active }))
    } catch { /* silently ignore */ }
  }

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'human_takeover', label: 'Humano' },
  ]

  const filtered = conversations
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c => {
      if (!search) return true
      const name = c.contact?.name ?? c.contact_name ?? ''
      return name.toLowerCase().includes(search.toLowerCase())
    })

  const selectedName = selected?.contact?.name ?? selected?.contact_name ?? ''
  const selectedChannelType = selected?.channel?.type ?? selected?.channel_type ?? 'whatsapp'

  return (
    <div className="flex h-full -m-6">
      {/* Conversation list */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full">
        <div className="px-4 py-3.5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">
              Conversaciones
              {!loadingConvs && <span className="ml-1.5 text-gray-400 font-normal">({filtered.length})</span>}
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={loadConversations} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <RefreshCw size={13} className={loadingConvs ? 'animate-spin' : ''} />
              </button>
              <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <Filter size={13} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-gray-100">
          {filters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f.key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-3 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center h-24 text-gray-400">
              <Loader size={18} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs text-gray-400">
              Sin conversaciones
            </div>
          ) : (
            filtered.map(conv => (
              <ConversationItem key={conv.id} conv={conv}
                active={selected?.id === conv.id}
                onClick={() => setSelected(conv)} />
            ))
          )}
        </div>
      </div>

      {/* Conversation view */}
      {selected ? (
        <div className="flex-1 flex flex-col h-full bg-gray-50">
          <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {initials(selectedName)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{selectedName || '—'}</p>
              <div className="flex items-center gap-1.5">
                <ChannelBadge type={selectedChannelType} />
                <StatusBadge status={selected.status} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {selected.ai_active ? <Bot size={14} className="text-purple-500" /> : <User size={14} />}
              <span>{selected.ai_active ? 'IA activa' : 'Modo humano'}</span>
              {selected.ai_active
                ? <ToggleRight size={22} className="text-purple-500 cursor-pointer" onClick={() => handleToggleAi(selected)} />
                : <ToggleLeft size={22} className="text-gray-300 cursor-pointer" onClick={() => handleToggleAi(selected)} />}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-24 text-gray-400">
                <Loader size={18} className="animate-spin" />
              </div>
            ) : messages.length > 0 ? (
              <>
                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                <div ref={messagesEndRef} />
              </>
            ) : (
              <p className="text-center text-sm text-gray-400 mt-10">Sin mensajes aún</p>
            )}
          </div>

          <div className="bg-white border-t border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400" />
              <button onClick={handleSend} disabled={!newMsg.trim() || sendingMsg}
                className="w-9 h-9 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors">
                {sendingMsg ? <Loader size={14} className="text-white animate-spin" /> : <Send size={15} className="text-white" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Selecciona una conversación
        </div>
      )}
    </div>
  )
}
