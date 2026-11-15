import type { ComponentType } from 'react'
import {
  BarChart2,
  BookOpen,
  CalendarCheck,
  CreditCard,
  Database,
  Inbox,
  Landmark,
  Scale,
  Settings,
  SlidersHorizontal,
  Table2,
  Upload,
  WalletCards,
} from 'lucide-react'

// IA — Implentation-plan.md 3.1 (T058 월 결산·지출 분석, 나머지 영역은 T059 이후)

export interface NavItem {
  path: string
  label: string
  Icon: ComponentType<{ className?: string }>
  exact?: boolean
}

/** 분석 영역 (질문 중심) + 데이터 스튜디오 */
export const MAIN_NAV: NavItem[] = [
  { path: '/', label: '월 결산', Icon: CalendarCheck, exact: true },
  { path: '/analysis', label: '지출 분석', Icon: BarChart2 },
  { path: '/net-worth', label: '자산·부채', Icon: Scale },
]

/** 데이터 스튜디오 서브 내비 (도메인 단위) */
export const DATA_NAV: NavItem[] = [
  { path: '/data/inbox', label: '인박스', Icon: Inbox },
  { path: '/data/transactions', label: '거래', Icon: Table2 },
  { path: '/data/loans', label: '대출', Icon: Landmark },
  { path: '/data/installments', label: '할부', Icon: CreditCard },
  { path: '/data/assets', label: '자산 메타', Icon: WalletCards },
  { path: '/data/rules', label: '규칙', Icon: SlidersHorizontal },
  { path: '/data/settings', label: '설정', Icon: Settings },
  { path: '/data/import', label: '가져오기', Icon: Upload },
  { path: '/data/reference', label: '데이터 사전', Icon: BookOpen },
]

export const DATA_ROOT: NavItem = { path: '/data/inbox', label: '데이터', Icon: Database }

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.path
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}
