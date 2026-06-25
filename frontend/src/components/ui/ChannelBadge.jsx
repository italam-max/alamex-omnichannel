// Channel badge — cohesive palette chrome; the dot keeps each channel's
// recognizable brand color so the channel is identifiable at a glance.
const config = {
  whatsapp:  { label: 'WhatsApp',  dot: '#25D366' },
  instagram: { label: 'Instagram', dot: '#E1306C' },
  messenger: { label: 'Messenger', dot: '#0084FF' },
  website:   { label: 'Web',       dot: 'var(--gold)' },
}

export default function ChannelBadge({ type, showLabel = true }) {
  const c = config[type] ?? config.whatsapp
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '2px 9px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 600,
      background: 'var(--sand-2)', color: 'var(--text-mid)',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.dot }} />
      {showLabel && c.label}
    </span>
  )
}
