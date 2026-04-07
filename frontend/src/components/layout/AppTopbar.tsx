import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getNavigationItem } from '../../navigation'

interface AppTopbarProps {
  onMobileMenuOpen: () => void
  metaBadge?: React.ReactNode
  className?: string
}

export function AppTopbar({ onMobileMenuOpen, metaBadge, className }: AppTopbarProps) {
  const { pathname } = useLocation()
  const meta = getNavigationItem(pathname) ?? { breadcrumb: 'MyLedge', title: pathname }

  return (
    <header className={cn('h-12 bg-surface-bar border-b border-border flex items-center px-5 gap-2 sticky top-0 z-30', className)}>
      <button
        className="md:hidden text-text-ghost hover:text-text-secondary mr-1"
        onClick={onMobileMenuOpen}
        aria-label="메뉴 열기"
      >
        <Menu className="w-5 h-5" />
      </button>
      <span className="text-label text-text-ghost hidden md:block">{meta.breadcrumb}</span>
      <span className="text-label text-text-ghost hidden md:block">›</span>
      <span className="text-body-md font-semibold text-text-primary">{meta.title}</span>
      {metaBadge && <div className="ml-auto">{metaBadge}</div>}
    </header>
  )
}
