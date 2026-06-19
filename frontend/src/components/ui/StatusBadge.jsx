const config = {
  active: { label: 'Activa', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  human_takeover: { label: 'Humano', bg: 'bg-amber-100', text: 'text-amber-700' },
  blocked: { label: 'Bloqueada', bg: 'bg-gray-100', text: 'text-gray-500' },
}

export default function StatusBadge({ status }) {
  const c = config[status] ?? config.active
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}
