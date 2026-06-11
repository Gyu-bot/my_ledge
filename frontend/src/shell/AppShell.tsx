import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Lock, Moon, Sun } from 'lucide-react'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { cn } from '../lib/utils'
import { DATA_NAV, DATA_ROOT, MAIN_NAV, isNavActive, type NavItem } from './navigation'

type Theme = 'dark' | 'light'
const THEME_KEY = 'ds-theme'

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

function SideNavLink({ item, indent = false }: { item: NavItem; indent?: boolean }) {
  const { pathname } = useLocation()
  const active = isNavActive(item, pathname)
  return (
    <NavLink
      to={item.path}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-label transition-colors duration-fast',
        indent && 'ml-3',
        active
          ? 'bg-bg-selected font-semibold text-accent'
          : 'text-text-secondary hover:bg-bg-inset hover:text-text-primary',
      )}
    >
      <item.Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const hasWrite = useWriteAccess()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const inData = pathname.startsWith('/data')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  return (
    <div className="flex min-h-screen bg-bg-base">
      {/* 데스크톱 사이드바 */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-surface px-3 py-4 md:flex">
        <div className="px-3 pb-4 text-section text-text-primary">MyLedge</div>

        <nav aria-label="주 메뉴" className="flex flex-1 flex-col gap-0.5">
          {MAIN_NAV.map((item) => (
            <SideNavLink key={item.path} item={item} />
          ))}

          <div className="mx-3 my-2 border-t border-border-subtle" />
          <div className="px-3 pb-1 text-micro font-semibold uppercase tracking-wider text-text-faint">데이터</div>
          {DATA_NAV.map((item) => (
            <SideNavLink key={item.path} item={item} indent />
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          {!hasWrite ? (
            <span
              className="inline-flex items-center gap-1 rounded-sm border border-warn-border bg-warn-bg px-1.5 py-0.5 text-micro font-medium text-warn"
              title="API 키가 없어 업로드·수정·삭제가 비활성화됩니다"
            >
              <Lock className="h-3 w-3" />
              읽기 전용
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            aria-label={theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            className="rounded-md border border-border p-1.5 text-text-muted transition-colors duration-fast hover:text-text-primary"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 데이터 스튜디오 서브 칩 (모바일 전용 — 데스크톱은 사이드바가 담당) */}
        {inData && (
          <nav
            aria-label="데이터 메뉴"
            className="sticky top-0 z-30 flex gap-1.5 overflow-x-auto border-b border-border-subtle bg-bg-base px-4 py-2 md:hidden"
          >
            {DATA_NAV.map((item) => {
              const active = isNavActive(item, pathname)
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'shrink-0 rounded-md border px-2.5 py-1 text-caption font-medium transition-colors duration-fast',
                    active
                      ? 'border-accent-border bg-accent-bg text-accent'
                      : 'border-border text-text-secondary',
                  )}
                >
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        )}

        <main className="mx-auto w-full max-w-content flex-1 px-4 pb-20 md:px-6 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* 모바일 하단 탭바 */}
      <nav
        aria-label="하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-border-subtle bg-bg-surface md:hidden"
      >
        {[...MAIN_NAV, DATA_ROOT].map((item) => {
          const active = item.path === DATA_ROOT.path ? inData : isNavActive(item, pathname)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-micro font-medium',
                active ? 'text-accent' : 'text-text-muted',
              )}
            >
              <item.Icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
