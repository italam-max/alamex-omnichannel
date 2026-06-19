import { useState } from 'react'
import { mockConversations, mockMessages } from '../../mocks/conversations'
import PageShell from '../../components/layout/PageShell'
import ChannelBadge from '../../components/ui/ChannelBadge'
import StatusBadge from '../../components/ui/StatusBadge'
import { Bot, User, Search, Filter, Send, ToggleLeft, ToggleRight } from 'lucide-react'

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function ConversationItem({ conv, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition-colors ${active ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {conv.contact.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-semibold text-gray-800 truncate">{conv.contact.name}</span>
            <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{timeAgo(conv.updated_at)}</span>
          </div>
          <p className="text-xs text-gray-500 truncate mb-1.5">{conv.last_message}</p>
          <div className="flex items-center gap-1.5">
            <ChannelBadge type={conv.channel.type} />
            <StatusBadge status={conv.status} />
            {conv.unread > 0 && (
              <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {conv.unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function MessageBubble({ msg }) {
  const isCustomer = msg.role === 'customer'
  const isAi = msg.role === 'ai'

  return (
    <div className={`flex gap-2 ${isCustomer ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${
        isCustomer ? 'bg-blue-500 text-white' : isAi ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-600'
      }`}>
        {isAi ? <Bot size={14} /> : <User size={14} />}
      </div>
      <div className={`max-w-[72%] ${isCustomer ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isCustomer
            ? 'bg-blue-500 text-white rounded-tr-sm'
            : isAi
            ? 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm'
            : 'bg-amber-50 border border-amber-200 text-gray-700 rounded-tl-sm'
        }`}>
          {msg.content}
        </div>
        {isAi && msg.model_used && (
          <span className="text-[10px] text-purple-400 px-1">IA · {msg.model_used}</span>
        )}
      </div>
    </div>
  )
}

export default function Inbox() {
  const [selected, setSelected] = useState(mockConversations[0])
  const [filter, setFilter] = useState('all')
  const [newMsg, setNewMsg] = useState('')

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'human_takeover', label: 'Humano' },
  ]

  const filtered = filter === 'all'
    ? mockConversations
    : mockConversations.filter(c => c.status === filter)

  const messages = selected ? mockMessages.filter(m => m.conversation === selected.id) : []

  return (
    <div className="flex h-full -m-6">
      {/* Sidebar list */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Conversaciones</h2>
            <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <Filter size={14} className="text-gray-400" />
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
        {/* Filters */}
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(conv => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              active={selected?.id === conv.id}
              onClick={() => setSelected(conv)}
            />
          ))}
        </div>
      </div>

      {/* Conversation view */}
      {selected ? (
        <div className="flex-1 flex flex-col h-full bg-gray-50">
          {/* Conv header */}
          <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {selected.contact.initials}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">{selected.contact.name}</p>
              <div className="flex items-center gap-1.5">
                <ChannelBadge type={selected.channel.type} />
                <StatusBadge status={selected.status} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {selected.ai_active ? <Bot size={14} className="text-purple-500" /> : <User size={14} />}
              <span>{selected.ai_active ? 'IA activa' : 'Modo humano'}</span>
              {selected.ai_active
                ? <ToggleRight size={22} className="text-purple-500 cursor-pointer" />
                : <ToggleLeft size={22} className="text-gray-300 cursor-pointer" />
              }
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length > 0
              ? messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
              : <p className="text-center text-sm text-gray-400 mt-10">Sin mensajes aún</p>
            }
          </div>

          {/* Input */}
          <div className="bg-white border-t border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
              />
              <button className="w-9 h-9 bg-blue-500 hover:bg-blue-600 rounded-xl flex items-center justify-center transition-colors">
                <Send size={15} className="text-white" />
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
