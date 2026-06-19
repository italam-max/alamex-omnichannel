const config = {
  whatsapp: { label: 'WhatsApp', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  instagram: { label: 'Instagram', bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500' },
  messenger: { label: 'Messenger', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  website:   { label: 'Web',       bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
}

export default function ChannelBadge({ type, showLabel = true }) {
  const c = config[type] ?? config.whatsapp
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {showLabel && c.label}
    </span>
  )
}
