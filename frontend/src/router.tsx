import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { HomePage } from './features/home/HomePage'
import { NetWorthPage } from './features/networth/NetWorthPage'
import { SignalsPage } from './features/signals/SignalsPage'
import { SpendingPage } from './features/spending/SpendingPage'
import { PlaceholderPage } from './features/PlaceholderPage'

// 새 IA — docs/frontend-remake/02-ia-redesign.md §2, §5 (레거시 redirect 포함)

const STUBS: Array<{ path: string; title: string; description: string; planned: string[]; wireframeRef: string }> = [
  {
    path: 'data/inbox',
    title: '데이터 · 인박스',
    description: '분류 품질 큐 + dry-run 승인 + 미연결 후보 통합 작업 피드.',
    planned: ['타입별 탭 칩과 카드 인라인 처리', '분류 커버리지 게이지'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §5',
  },
  {
    path: 'data/transactions',
    title: '데이터 · 거래',
    description: '거래 작업대 — 행 보기 / 그룹 보기(반복 결제 분류 흡수).',
    planned: ['12종 필터 바', '행 상세 패널 편집', '일괄 적용 / 삭제·복원 preview / undo'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §6',
  },
  {
    path: 'data/loans',
    title: '데이터 · 대출',
    description: '계좌 메타 + 거래 연결 + 매칭 규칙 통합.',
    planned: ['계좌 탭 (표시명·성격·상환 메타)', '거래 연결 탭 (일괄 연결)', '규칙 탭 (거래처 매칭)'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §7',
  },
  {
    path: 'data/installments',
    title: '데이터 · 할부',
    description: '할부 계획·거래 연결·월별 예측.',
    planned: ['계획 등록·편집', '거래 연결 (행별/일괄, 연속 회차)', '월별 Observed/Projected/Missed 예측'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §8',
  },
  {
    path: 'data/assets',
    title: '데이터 · 자산 메타',
    description: '자산 유동성 등급과 현금성 여부 편집.',
    planned: ['최신 스냅샷 자산별 유동성/현금성 저장', '미지정 자산 우선 정렬'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §9',
  },
  {
    path: 'data/rules',
    title: '데이터 · 규칙',
    description: '자동분류 규칙과 업로드 후 자동 적용 토글.',
    planned: ['카테고리 / 거래처 정규화 / 반복결제 규칙 탭', '규칙별 일괄 적용'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §10',
  },
  {
    path: 'data/settings',
    title: '데이터 · 설정',
    description: '분석 파라미터와 재무 목표(비상금·저축률·부채 전략).',
    planned: ['재무 목표 (settings/analytics.financial_targets)', '섹션별 분석 파라미터 — default/saved/effective 구분'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §10b',
  },
  {
    path: 'data/import',
    title: '데이터 · 가져오기',
    description: 'BankSalad 엑셀 업로드와 데이터 초기화.',
    planned: ['업로드 (스냅샷 기준일 필수, 자산·보험·투자·대출 카운트)', '업로드 이력 10건 · 관측 데이터 범위', 'Danger Zone (확인 문구 초기화)'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §11',
  },
  {
    path: 'data/reference',
    title: '데이터 · 데이터 사전',
    description: '외부 에이전트와 같은 canonical 수치 검증 + 스키마 레퍼런스.',
    planned: ['canonical KPI·월별 검증 테이블', 'view reference (AI 권장 표시)'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §12',
  },
]

const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/analysis/spending', to: '/spending' },
  { from: '/analysis/assets', to: '/net-worth' },
  { from: '/analysis/insights', to: '/signals' },
  { from: '/operations/workbench', to: '/data/transactions' },
  { from: '/operations/loan-mapping', to: '/data/loans' },
  { from: '/operations/installments', to: '/data/installments' },
  { from: '/operations/asset-settings', to: '/data/assets' },
  { from: '/operations/auto-classification', to: '/data/rules' },
  { from: '/operations/canonical-views', to: '/data/reference' },
  { from: '/operations/recurring-classification', to: '/data/transactions?view=groups' },
  { from: '/assets', to: '/net-worth' },
  { from: '/income', to: '/' },
  { from: '/transfers', to: '/' },
]

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'spending', element: <SpendingPage /> },
      { path: 'net-worth', element: <NetWorthPage /> },
      { path: 'signals', element: <SignalsPage /> },
      ...STUBS.map(({ path, ...props }) => ({ path, element: <PlaceholderPage {...props} /> })),
      { path: 'data', element: <Navigate to="/data/inbox" replace /> },
    ],
  },
  ...LEGACY_REDIRECTS.map(({ from, to }) => ({ path: from, element: <Navigate to={to} replace /> })),
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
