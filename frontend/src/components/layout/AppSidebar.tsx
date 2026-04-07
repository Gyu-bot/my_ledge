import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Home, BarChart2, DollarSign, Lightbulb, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: '개요', Icon: Home, exact: true },
] as const

const ANALYSIS_ITEMS = [
  { to: '/analysis/spending', label: '지출 분석', Icon: BarChart2 },
  { to: '/analysis/assets', label: '자산 현황', Icon: DollarSign },
  { to: '/analysis/insights', label: '인사이트', Icon: Lightbulb },
] as const

const OPS_ITEMS = [
  { to: '/operations/workbench', label: '거래 작업대', Icon: Settings },
] as const

function NavBtn({ to, label, Icon, exact = false }: { to: string; label: string; Icon: React.ComponentType<{ className?: string }>; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={label}
      className={({ isActive }) =>
        cn(
          'w-10 h-10 flex items-center justify-center rounded-lg mx-auto transition-colors',
          isActive
            ? 'bg-accent-dim text-accent'
            : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
        )
      }
    >
      <Icon className="w-[18px] h-[18px]" />
    </NavLink>
  )
}

interface AppSidebarProps {
  onMobileOpen: () => void
  className?: string
}

export function AppSidebar({ onMobileOpen: _onMobileOpen, className }: AppSidebarProps) {
  return (
    <nav
      className={cn(
        'hidden md:flex flex-col items-center w-14 shrink-0 bg-surface-bar border-r border-border h-screen sticky top-0',
        className,
      )}
    >
      <div className="w-8 h-8 mt-4 mb-6 rounded-lg bg-gradient-to-br from-accent to-[#059669] flex items-center justify-center text-white font-extrabold text-sm shrink-0">
        M
      </div>

      <div className="flex flex-col gap-0.5 w-full px-1">
        {NAV_ITEMS.map((item) => <NavBtn key={item.to} {...item} />)}
      </div>

      <div className="w-6 h-px bg-border my-2" />

      <div className="flex flex-col gap-0.5 w-full px-1">
        {ANALYSIS_ITEMS.map((item) => <NavBtn key={item.to} {...item} />)}
      </div>

      <div className="w-6 h-px bg-border my-2" />

      <div className="flex flex-col gap-0.5 w-full px-1">
        {OPS_ITEMS.map((item) => <NavBtn key={item.to} {...item} />)}
      </div>
    </nav>
  )
}
