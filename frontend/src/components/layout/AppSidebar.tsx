import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { getNavigationSections } from '../../navigation'

function NavBtn({ to, label, Icon, exact = false }: { to: string; label: string; Icon: React.ComponentType<{ className?: string }>; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
          isActive
            ? 'bg-accent-dim text-accent'
            : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="text-label font-medium">{label}</span>
    </NavLink>
  )
}

interface AppSidebarProps {
  className?: string
}

export function AppSidebar({ className }: AppSidebarProps) {
  const sections = getNavigationSections('desktop')

  return (
    <nav
      className={cn(
        'sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-surface-bar border-r border-border md:flex',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-sm font-extrabold text-text-inverse">
          M
        </div>
        <div className="min-w-0">
          <div className="text-body-md font-semibold text-text-primary">MyLedge</div>
          <div className="text-micro text-text-ghost">Personal finance dashboard</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.key} className="flex flex-col gap-1">
            <div className="px-3 pb-1 text-micro uppercase tracking-[0.16em] text-text-ghost">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavBtn key={item.path} to={item.path} label={item.label} Icon={item.Icon} exact={item.exact} />
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}
