import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { getNavigationSections } from '../../navigation'

function NavBtn({
  to,
  label,
  Icon,
  exact = false,
  collapsed,
}: {
  to: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-lg py-2.5 transition-colors',
          collapsed ? 'justify-center px-2' : 'gap-3 px-3',
          isActive
            ? 'bg-accent-dim text-accent'
            : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="text-label font-medium">{label}</span>}
    </NavLink>
  )
}

interface AppSidebarProps {
  className?: string
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ className, collapsed, onToggle }: AppSidebarProps) {
  const sections = getNavigationSections('desktop')

  return (
    <nav
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface-bar transition-[width] duration-200 md:flex',
        collapsed ? 'w-20' : 'w-56',
        className,
      )}
    >
      <div
        className={cn(
          'border-b border-border px-4 py-4',
          collapsed ? 'flex flex-col items-center gap-3' : 'flex items-center gap-3',
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-sm font-extrabold text-text-inverse">
          M
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-body-md font-semibold text-text-primary">MyLedge</div>
            <div className="text-micro text-text-ghost">Personal finance dashboard</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-ghost transition-colors hover:bg-surface-section hover:text-text-secondary"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className={cn('flex flex-1 flex-col overflow-y-auto py-4', collapsed ? 'gap-3 px-2.5' : 'gap-4 px-3')}>
        {sections.map((section) => (
          <div key={section.key} className="flex flex-col gap-1">
            {!collapsed && (
              <div className="px-3 pb-1 text-micro uppercase tracking-[0.16em] text-text-muted">
                {section.label}
              </div>
            )}
            {section.items.map((item) => (
              <NavBtn
                key={item.path}
                to={item.path}
                label={item.label}
                Icon={item.Icon}
                exact={item.exact}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}
