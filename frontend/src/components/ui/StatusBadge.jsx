// Conversation status — premium palette semantics.
const config = {
  active:         { label: 'Activa',     bg: 'var(--jade-pale)', fg: 'var(--jade)' },
  human_takeover: { label: 'Humano',     bg: 'var(--gold-pale)', fg: 'var(--gold)' },
  blocked:        { label: 'Bloqueada',  bg: 'var(--sand-2)',    fg: 'var(--text-muted)' },
}

export default function StatusBadge({ status }) {
  const c = config[status] ?? config.active
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 9px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 600,
      background: c.bg, color: c.fg,
    }}>
      {c.label}
    </span>
  )
}
