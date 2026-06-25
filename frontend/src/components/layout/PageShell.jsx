import Header from './Header'

export default function PageShell({ title, subtitle, children }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <Header title={title} subtitle={subtitle} />
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {children}
      </main>
    </div>
  )
}
