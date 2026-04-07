import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Home, BarChart2, DollarSign, Lightbulb, Settings, X } from 'lucide-react'

const ALL_ITEMS = [
  { to: '/', label: '개요', Icon: Home, exact: true, section: null as string | null },
  { to: '/analysis/spending', label: '지출 분석', Icon: BarChart2, exact: false, section: '분석' as string | null },
  { to: '/analysis/assets', label: '자산 현황', Icon: DollarSign, exact: false, section: null as string | null },
  { to: '/analysis/insights', label: '인사이트', Icon: Lightbulb, exact: false, section: null as string | null },
  { to: '/operations/workbench', label: '거래 작업대', Icon: Settings, exact: false, section: '운영' as string | null },
]

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const location = useLocation()
  useEffect(() => { onClose() }, [location.pathname])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-56 bg-surface-bar border-r border-border z-50 flex flex-col md:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-[#059669] flex items-center justify-center text-white font-extrabold text-xs">M</div>
            <span className="text-body-md font-semibold text-text-primary">MyLedge</span>
          </div>
          <button onClick={onClose} className="text-text-ghost hover:text-text-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {ALL_ITEMS.map((item) => (
            <div key={item.to}>
              {item.section && (
                <div className="text-micro text-text-ghost uppercase tracking-widest px-2 py-1 mt-2">
                  {item.section}
                </div>
              )}
              <NavLink
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-label font-medium transition-colors',
                    isActive
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
                  )
                }
              >
                <item.Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}
