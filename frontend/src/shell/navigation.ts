import type { ComponentType } from 'react'
import {
  Activity,
  ArrowLeftRight,
  BarChart2,
  BookOpen,
  CalendarCheck,
  CreditCard,
  Inbox,
  Landmark,
  Repeat,
  Scale,
  Settings,
  SlidersHorizontal,
  Table2,
  Tags,
  Upload,
  WalletCards,
  Wrench,
} from 'lucide-react'

// IA — Implentation-plan.md 3.1 (T058 월 결산·지출 분석, T059 약정 현황·작업대, T061 재무상태·이체 목적)

export interface NavItem {
  path: string
  label: string
  Icon: ComponentType<{ className?: string }>
  exact?: boolean
}

/** 분석 영역 (질문 중심) */
export const MAIN_NAV: NavItem[] = [
  { path: '/', label: '월 결산', Icon: CalendarCheck, exact: true },
  { path: '/analysis', label: '지출 분석', Icon: BarChart2 },
  { path: '/commitments', label: '약정 현황', Icon: Repeat },
  { path: '/net-worth', label: '재무상태', Icon: Scale },
]

/** 작업대 서브 내비 — 분류, 거래, 규칙, 가져오기와 되돌리기, 설정 */
export const DATA_NAV: NavItem[] = [
  { path: '/data/inbox', label: '분류', Icon: Inbox },
  { path: '/data/transactions', label: '거래', Icon: Table2 },
  { path: '/data/nature', label: '기본값·정기 지급', Icon: Tags },
  { path: '/data/transfers', label: '이체 목적', Icon: ArrowLeftRight },
  { path: '/data/loans', label: '대출', Icon: Landmark },
  { path: '/data/installments', label: '할부', Icon: CreditCard },
  { path: '/data/assets', label: '자산 메타', Icon: WalletCards },
  { path: '/data/rules', label: '규칙', Icon: SlidersHorizontal },
  { path: '/data/status', label: '자료 현황', Icon: Activity },
  { path: '/data/import', label: '가져오기', Icon: Upload },
  { path: '/data/settings', label: '설정', Icon: Settings },
  { path: '/data/reference', label: '데이터 사전', Icon: BookOpen },
]

export const DATA_ROOT: NavItem = { path: '/data/inbox', label: '작업대', Icon: Wrench }

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.path
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}
