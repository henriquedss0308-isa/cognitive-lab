import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/catalog', label: 'Testes', icon: '⬡' },
  { to: '/batteries', label: 'Baterias', icon: '▣' },
  { to: '/history', label: 'Histórico', icon: '◫' },
  { to: '/settings', label: 'Dados', icon: '◎' },
]

export function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-lab-border bg-lab-surface flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-lab-border">
          <h1 className="text-lg font-semibold tracking-tight">COGNITIVE LAB</h1>
          <p className="text-xs text-lab-muted mt-0.5">Seu laboratório cognitivo pessoal</p>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-lab-accent/15 text-lab-accent'
                    : 'text-lab-muted hover:text-lab-text hover:bg-lab-surface-2'
                )
              }
            >
              <span className="text-base opacity-70">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-lab-border">
          <p className="text-xs text-lab-muted leading-relaxed">
            Instrumento pessoal. Não diagnostica condições clínicas.
          </p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}