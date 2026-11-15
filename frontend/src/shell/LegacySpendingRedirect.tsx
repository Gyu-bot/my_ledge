import { Navigate, useSearchParams } from 'react-router-dom'

/** 예전 지출 화면의 탭(lens): 추이·고정비·수입은 월 결산으로, 구성·거래처·달력과 탭 없음은 지출 분석으로 (T058) */
const MONTH_CLOSE_LENSES = new Set(['trend', 'fixed', 'income'])

export function LegacySpendingRedirect() {
  const [params] = useSearchParams()
  const lens = params.get('lens')
  if (lens && MONTH_CLOSE_LENSES.has(lens)) return <Navigate to="/" replace />
  const category = params.get('category')
  return <Navigate to={category ? `/analysis?category=${encodeURIComponent(category)}` : '/analysis'} replace />
}
