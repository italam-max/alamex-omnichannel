// Almenara — "al-manara" (faro / hoguera de señales). A beacon whose light
// reaches across distance, just like the platform reaches every channel.
export default function AlmenaraMark({ size = 32, tower = '#C09B3A', light = '#C09B3A', glow = true, pulse = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* radiating signal beams */}
      <g stroke={light} strokeWidth="1.7" strokeLinecap="round" opacity="0.7">
        <line x1="16" y1="9" x2="16" y2="2.5" />
        <line x1="16" y1="9" x2="8" y2="5" />
        <line x1="16" y1="9" x2="24" y2="5" />
        <line x1="16" y1="9" x2="5" y2="10" />
        <line x1="16" y1="9" x2="27" y2="10" />
      </g>
      {/* tower */}
      <path d="M13 14 H19 L20.5 29 H11.5 Z" fill={tower} />
      {/* gallery / lamp platform */}
      <rect x="11.3" y="12.2" width="9.4" height="2.2" rx="0.7" fill={tower} />
      {/* beacon fire glow */}
      {glow && <circle className={pulse ? 'beacon-glow' : undefined} cx="16" cy="9" r="5" fill={light} opacity="0.2" style={{ transformBox: 'fill-box' }} />}
      <circle cx="16" cy="9" r="2.7" fill={light} />
    </svg>
  )
}
