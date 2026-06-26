import { Construction } from 'lucide-react'
import pkg from '../../../package.json'

const GOLD = '#C09B3A'

/**
 * App-wide development band. Makes it unmistakable that this build is a
 * work-in-progress and stamps the current version. Slim but prominent, shown
 * above every page's content.
 */
export default function DevBanner() {
  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '7px 16px',
        background:
          'linear-gradient(90deg, #0C1A2E 0%, #11233d 50%, #0C1A2E 100%)',
        borderBottom: '1px solid rgba(192,155,58,0.3)',
        // hazard stripe accent at the very top edge
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(192,155,58,0.16) 0 10px, transparent 10px 20px)',
        backgroundSize: '100% 3px',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'top',
      }}
    >
      <Construction size={14} style={{ color: GOLD, flexShrink: 0 }} />
      <span
        style={{
          fontSize: '11.5px',
          letterSpacing: '0.06em',
          color: 'rgba(246,239,220,0.82)',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Entorno de desarrollo · funcionalidad en construcción
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '10.5px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: '#0B1728',
          background: GOLD,
          padding: '2px 9px',
          borderRadius: '99px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        v{pkg.version} · DEV
      </span>
    </div>
  )
}
