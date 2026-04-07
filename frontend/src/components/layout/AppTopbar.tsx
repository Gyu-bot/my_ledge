import { useLocation } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'

const PAGE_META: Record<string, { breadcrumb: string; title: string }> = {
  '/': { breadcrumb: 'MyLedge', title: '개요' },
  '/analysis/spending': { breadcrumb: '분석', title: '지출 분석' },
  '/analysis/assets': { breadcrumb: '분석', title: '자산 현황' },
  '/analysis/insights': { breadcrumb: '분석', title: '인사이트' },
  '/operations/workbench': { breadcrumb: '운영', title: '거래 작업대' },
}

interface AppTopbarProps {
  onMobileMenuOpen: () => void
  metaBadge?: React.ReactNode
  className?: string
}

export function AppTopbar({ onMobileMenuOpen, metaBadge, className }: AppTopbarProps) {
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] ?? { breadcrumb: 'MyLedge', title: pathname }

  return (
    <header className={cn('h-12 bg-surface-bar border-b border-border flex items-center px-5 gap-2 sticky top-0 z-30', className)}>
      <button
        className="md:hidden text-text-ghost hover:text-text-secondary mr-1"
        onClick={onMobileMenuOpen}
        aria-label="메뉴 열기"
      >
        <Bars3Icon className="w-5 h-5" />
      </button>
      <span className="text-[11px] text-text-ghost hidden md:block">{meta.breadcrumb}</span>
      <span className="text-[11px] text-text-ghost hidden md:block">›</span>
      <span className="text-[13px] font-semibold text-text-primary">{meta.title}</span>
      {metaBadge && <div className="ml-auto">{metaBadge}</div>}
    </header>
  )
}
