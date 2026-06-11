import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { HomePage } from './features/home/HomePage'
import { PlaceholderPage } from './features/PlaceholderPage'

// 새 IA — docs/frontend-remake/02-ia-redesign.md §2, §5 (레거시 redirect 포함)

const STUBS: Array<{ path: string; title: string; description: string; planned: string[]; wireframeRef: string }> = [
  {
    path: 'spending',
    title: '지출',
    description: '어디에, 어떤 성격의 돈을 쓰고 있나?',
    planned: ['전역 기간 컨트롤 + 수입 포함 토글', '렌즈 탭: 추이 / 구성 / 고정비 / 거래처 / 달력', '렌즈 선택을 반영하는 공통 거래 내역 패널'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §2',
  },
  {
    path: 'net-worth',
    title: '자산·부채',
    description: '자산·부채 스냅샷 변화와 상환 부담.',
    planned: ['KPI + 순자산 추이·구성', '유동성 보드 (편집은 데이터 > 자산 메타)', '대출 보드 (잔액·금리·월상환·진행률)', '할부 잔여 요약'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §3',
  },
  {
    path: 'signals',
    title: '신호',
    description: '전과 다른 것, 위험한 것, 검토할 것.',
    planned: ['기준 모드(직전 마감월/부분 기간) 전역 선택', '신호 카드 피드 (이상 지출 + 구매 게이트 + 상태 통합)', '재량 지출 속도 / 반복 결제 현황 / 비교 도구'],
    wireframeRef: 'docs/frontend-remake/03-wireframes.md §4',
  },
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
    path: 'data/import',
    title: '데이터 · 가져오기',
    description: 'BankSalad 엑셀 업로드와 데이터 초기화.',
    planned: ['업로드 (스냅샷 기준일 필수)', '업로드 이력 10건', 'Danger Zone (확인 문구 초기화)'],
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
      ...STUBS.map(({ path, ...props }) => ({ path, element: <PlaceholderPage {...props} /> })),
      { path: 'data', element: <Navigate to="/data/inbox" replace /> },
    ],
  },
  ...LEGACY_REDIRECTS.map(({ from, to }) => ({ path: from, element: <Navigate to={to} replace /> })),
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
