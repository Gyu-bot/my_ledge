import { Link } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { useSelectedInvestments } from '../../hooks/useSourcePolicy'
import { SourceSelectionDetails } from '../assets/SourceSelectionDetails'
import { SOURCE_LABEL, sourceMoney } from '../assets/sourcePresentation'

export function SelectedInvestmentsPanel() {
  const selected = useSelectedInvestments()
  const data = selected.data
  return (
    <Card title="선택 소스 기준 현재 자산" meta="과거 스냅샷과 구분한 참고값" action={<Link className="text-caption text-transfer hover:underline" to="/data/settings">소스 설정</Link>}>
      {selected.isLoading ? <ListSkeleton rows={4} /> : selected.error || !data ? <ErrorState message="선택 소스 자산을 불러오지 못했습니다" onRetry={() => void selected.refetch()} /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-caption text-text-muted">뱅샐 스냅샷 순자산</p><p className="tnum text-label font-semibold">{sourceMoney(data.confirmed_net_worth)}</p></div>
            <div><p className="text-caption text-text-muted">{data.investment_total_complete ? '선택 소스 투자 평가액' : '확인된 평가액 소계 (전체 합계 아님)'}</p><p className="tnum text-label font-semibold">{sourceMoney(data.investment_total)}</p></div>
            <div><p className="text-caption text-text-muted">현재 추정 순자산 <Badge variant="estimate">추정</Badge></p><p className="tnum text-label font-semibold text-estimate">{sourceMoney(data.estimated_net_worth)}</p></div>
          </div>
          <p className="text-caption text-text-muted">뱅샐 스냅샷과 투자 평가 시점은 다를 수 있습니다. 시점 사이의 이체로 중복·누락이 생길 수 있어 투자 성과나 수익률로 해석하지 않습니다. 매핑·예수금 범위를 확인할 수 없으면 추정 총액을 표시하지 않습니다.</p>
          <SourceSelectionDetails data={data} />
          {data.items.length > 0 && <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-caption font-medium">선택된 보유 항목 {data.items.length}건</summary>
            <ul className="mt-2 divide-y divide-border-subtle">{data.items.map((item, index) => <li key={`${item.account_key}:${item.instrument_key}:${index}`} className="flex flex-wrap items-start justify-between gap-2 py-2 text-caption">
              <div><p className="font-medium">{item.product_name}</p><p className="break-all text-text-muted">{item.account_key} · {SOURCE_LABEL[item.source]}</p></div>
              <span className="tnum">{item.currency === 'KRW' ? sourceMoney(item.market_value) : `${item.market_value ?? '정보 없음'} ${item.currency}`}</span>
            </li>)}</ul>
          </details>}
        </div>
      )}
    </Card>
  )
}
