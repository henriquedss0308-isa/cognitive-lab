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

/**
 * Abaixo de `md` a barra lateral vira barra superior.
 *
 * Uma coluna fixa de 13rem consome mais da metade de uma tela de 375px e deixa
 * o conteúdo espremido; em cima, a navegação rola na horizontal e o conteúdo
 * fica com a largura toda. Só CSS — a mesma marcação serve aos dois casos.
 */
export function Layout() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-lab-bg">
      <aside
        className={clsx(
          'shrink-0 flex border-lab-border',
          'flex-col md:w-52 md:border-r',
          'border-b md:border-b-0'
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:py-5">
          <div className="min-w-0">
            <h1 className="text-[0.8125rem] font-semibold tracking-[0.14em] text-lab-fg truncate">
              COGNITIVE LAB
            </h1>
            <p className="text-[0.6875rem] text-lab-faint mt-1 tracking-wide hidden md:block">
              Laboratório cognitivo pessoal
            </p>
          </div>
          {/* No estreito o seletor vive no topo; no largo, no rodapé da coluna. */}
          <ThemeToggle className="md:hidden" />
        </div>

        <nav
          className={clsx(
            'flex md:flex-col md:flex-1 gap-px px-2 pb-2 md:pb-0',
            'overflow-x-auto md:overflow-x-visible'
          )}
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[0.8125rem]',
                  'whitespace-nowrap transition-colors',
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
                      'absolute rounded-full transition-colors',
                      'md:left-0 md:top-1/2 md:-translate-y-1/2 md:w-0.5 md:h-4',
                      'left-3 right-3 bottom-0 h-0.5 md:right-auto md:bottom-auto',
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

        <div className="hidden md:block px-3 py-4 border-t border-lab-border space-y-3">
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
