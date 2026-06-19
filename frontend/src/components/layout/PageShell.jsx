import Header from './Header'

export default function PageShell({ title, subtitle, children }) {
  return (
    <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
      <Header title={title} subtitle={subtitle} />
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
