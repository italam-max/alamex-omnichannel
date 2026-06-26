import pkg from '../../../package.json'

const YELLOW = '#F5C518'
const INK = '#14110A'

/**
 * Hazard-tape development band — yellow/black caution stripes with a stamped
 * label. Makes it unmistakable, at a glance, that this build is under
 * construction. Slim; the stripes carry the signal, not the height.
 */
export default function DevBanner() {
  return (
    <div
      role="status"
      aria-label="Aplicación en desarrollo"
      style={{
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        // diagonal caution stripes
        backgroundImage:
          `repeating-linear-gradient(45deg, ${YELLOW} 0 18px, ${INK} 18px 36px)`,
        borderTop: `2px solid ${INK}`,
        borderBottom: `2px solid ${INK}`,
      }}
    >
      {/* Stamped label plate (keeps text readable over the stripes) */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          background: INK,
          color: YELLOW,
          padding: '5px 18px',
          borderRadius: '4px',
          border: `1.5px solid ${YELLOW}`,
          fontSize: '12px',
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        <span aria-hidden="true">⚠</span>
        Aplicación en desarrollo
        <span style={{
          background: YELLOW, color: INK, padding: '1px 8px', borderRadius: '3px',
          fontSize: '11px', letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums',
        }}>
          v{pkg.version} · DEV
        </span>
        <span aria-hidden="true">⚠</span>
      </span>
    </div>
  )
}
