import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { ThemeToggle } from './ThemeToggle'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/catalog', label: 'Testes', icon: '⬡' },
  { to: '/batteries', label: 'Baterias', icon: '▣' },
  { to: '/history', label: 'Histórico', icon: '◫' },
  { to: '/settings', label: 'Dados', icon: '◎' },
]

export function Layout() {
  return (
    <div className="min-h-screen flex bg-lab-bg">
      <aside className="w-52 border-r border-lab-border flex flex-col shrink-0">
        <div className="px-4 py-5">
          <h1 className="text-[0.8125rem] font-semibold tracking-[0.14em] text-lab-fg">
            COGNITIVE LAB
          </h1>
          <p className="text-[0.6875rem] text-lab-faint mt-1 tracking-wide">
            Laboratório cognitivo pessoal
          </p>
        </div>

        <nav className="flex-1 px-2 space-y-px">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-[0.8125rem] transition-colors',
                  isActive
                    ? 'bg-lab-surface-2 text-lab-fg font-medium'
                    : 'text-lab-muted hover:text-lab-text hover:bg-lab-surface'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Marca a rota ativa por forma, e não só por cor. */}
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full transition-colors',
                      isActive ? 'bg-lab-accent' : 'bg-transparent'
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'text-sm leading-none transition-colors',
                      isActive ? 'text-lab-accent' : 'text-lab-faint group-hover:text-lab-muted'
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-lab-border space-y-3">
          <ThemeToggle className="w-full" />
          <p className="text-[0.6875rem] text-lab-faint leading-relaxed px-1">
            Instrumento pessoal. Não diagnostica condições clínicas.
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
