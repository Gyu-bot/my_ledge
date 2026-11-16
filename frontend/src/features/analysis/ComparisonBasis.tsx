import { Select } from '../../ds/Field'
import type { BaselineMethod, ComparisonBasis } from '../../types/metrics'

export function BaselineControl({ value, onChange }: { value: BaselineMethod; onChange: (value: BaselineMethod) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
      비교 기준
      <Select aria-label="비교 기준" value={value} onChange={(event) => onChange(event.target.value as BaselineMethod)}>
        <option value="median_of_recent_closed_months">최근 마감월 중앙값</option>
        <option value="previous_month">직전 월</option>
      </Select>
    </label>
  )
}

const UNAVAILABLE_LABELS = {
  data_start: '직전 월이 자료 시작 전이거나 월중에 시작한 첫 달이라 비교할 수 없습니다.',
  baseline_start_date: '직전 월이 설정한 기준 구간 시작일보다 앞서 있어 비교할 수 없습니다.',
  no_data: '직전 월에 관측된 거래가 없어 비교할 수 없습니다. 0원으로 대신하지 않습니다.',
} as const

export function BasisNote({ basis }: { basis: ComparisonBasis }) {
  return (
    <div className="space-y-1 text-caption text-text-muted">
      <p>
        비교 기준: {basis.baseline_method_label}
        {' · '}기준 기간: {basis.baseline_periods.join(', ') || '없음'}
        {basis.baseline_status === 'fewer_than_requested' ? ` · 요청한 ${basis.baseline_months_requested}개월보다 적음` : ''}
        {basis.baseline_start_date ? ` · 기준 구간 시작일 ${basis.baseline_start_date}` : ''}
        {basis.skipped_periods.length > 0 ? ` · 자료 없는 달 제외: ${basis.skipped_periods.map((item) => item.period).join(', ')}` : ''}
        {' · '}{basis.partial_month_note}
      </p>
      {basis.baseline_method === 'previous_month' && basis.baseline_unavailable_reason ? (
        <p role="note">{UNAVAILABLE_LABELS[basis.baseline_unavailable_reason]}</p>
      ) : basis.baseline_status === 'none' ? <p>기준으로 쓸 이전 마감월이 없습니다.</p> : null}
    </div>
  )
}
