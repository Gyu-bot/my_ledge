import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { X } from 'lucide-react'
import { getNavigationSections } from '../../navigation'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const location = useLocation()
  const sections = getNavigationSections('mobile')
  useEffect(() => { onClose() }, [location.pathname, onClose])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-56 bg-surface-bar border-r border-border z-50 flex flex-col md:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center text-text-inverse font-extrabold text-xs">M</div>
            <span className="text-body-md font-semibold text-text-primary">MyLedge</span>
          </div>
          <button onClick={onClose} className="text-text-ghost hover:text-text-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="px-2 py-1 text-micro uppercase tracking-widest text-text-ghost">
                {section.label}
              </div>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-label font-medium transition-colors',
                      isActive
                        ? 'bg-accent-dim text-accent'
                        : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
                    )
                  }
                >
                  <item.Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}
