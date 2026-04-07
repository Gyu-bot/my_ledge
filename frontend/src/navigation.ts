import type { ComponentType } from 'react'
import { Home, BarChart2, DollarSign, Lightbulb, Settings } from 'lucide-react'

export interface NavigationItem {
  path: string
  label: string
  title: string
  breadcrumb: string
  section: 'overview' | 'analysis' | 'operations'
  sectionLabel: string
  exact?: boolean
  desktopNav?: boolean
  mobileNav?: boolean
  Icon: ComponentType<{ className?: string }>
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    path: '/',
    label: '개요',
    title: '개요',
    breadcrumb: 'MyLedge',
    section: 'overview',
    sectionLabel: '개요',
    exact: true,
    desktopNav: true,
    mobileNav: true,
    Icon: Home,
  },
  {
    path: '/analysis/spending',
    label: '지출 분석',
    title: '지출 분석',
    breadcrumb: '분석',
    section: 'analysis',
    sectionLabel: '분석',
    desktopNav: true,
    mobileNav: true,
    Icon: BarChart2,
  },
  {
    path: '/analysis/assets',
    label: '자산 현황',
    title: '자산 현황',
    breadcrumb: '분석',
    section: 'analysis',
    sectionLabel: '분석',
    desktopNav: true,
    mobileNav: true,
    Icon: DollarSign,
  },
  {
    path: '/analysis/insights',
    label: '인사이트',
    title: '인사이트',
    breadcrumb: '분석',
    section: 'analysis',
    sectionLabel: '분석',
    desktopNav: true,
    mobileNav: true,
    Icon: Lightbulb,
  },
  {
    path: '/operations/workbench',
    label: '거래 작업대',
    title: '거래 작업대',
    breadcrumb: '운영',
    section: 'operations',
    sectionLabel: '운영',
    desktopNav: true,
    mobileNav: true,
    Icon: Settings,
  },
]

export function getNavigationItem(pathname: string) {
  return NAVIGATION_ITEMS.find((item) => item.path === pathname)
}

export function getNavigationSections(mode: 'desktop' | 'mobile') {
  const key = mode === 'desktop' ? 'desktopNav' : 'mobileNav'
  const visibleItems = NAVIGATION_ITEMS.filter((item) => item[key])

  return visibleItems.reduce<Array<{ key: NavigationItem['section']; label: string; items: NavigationItem[] }>>(
    (sections, item) => {
      const existing = sections.find((section) => section.key === item.section)
      if (existing) {
        existing.items.push(item)
        return sections
      }

      sections.push({
        key: item.section,
        label: item.sectionLabel,
        items: [item],
      })
      return sections
    },
    [],
  )
}
