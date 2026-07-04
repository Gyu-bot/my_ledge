import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../../features/data/SettingsPage'
import type { AnalyticsSettingsResponse } from '../../types/settings'
import { analyticsSettingsResponse, withEffectiveRatios } from './settingsPageFixtures'

const patchMutate = vi.fn().mockResolvedValue({})
const settingsMock = vi.hoisted(() => ({
  analyticsSettingsResponse: null as AnalyticsSettingsResponse | null,
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () => ({
    data: settingsMock.analyticsSettingsResponse,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePatchAnalyticsSettings: () => ({ mutateAsync: patchMutate, isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>)
}

function settingsPage() {
  return <MemoryRouter><SettingsPage /></MemoryRouter>
}

function getByLabelPrefix(label: string): HTMLElement {
  return screen.getByLabelText((content) => content.startsWith(label))
}

function changeField(label: string, value: string) {
  fireEvent.change(getByLabelPrefix(label), { target: { value } })
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

function openHelp(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('SettingsPage', () => {
  beforeEach(() => {
    patchMutate.mockClear()
    settingsMock.analyticsSettingsResponse = analyticsSettingsResponse
  })

  it('effective 값으로 폼을 초기화한다 (4개월 / 50% / avalanche)', () => {
    renderPage()
    expect(getByLabelPrefix('비상금 목표 (개월)')).toHaveValue(4)
    expect(getByLabelPrefix('저축률 목표 (%)')).toHaveValue(50)
    expect(getByLabelPrefix('부채 상환 전략')).toHaveValue('avalanche')
  })

  it('backend가 반환하는 분석 설정 contract 섹션을 모두 렌더링한다', () => {
    renderPage()
    for (const name of ['spending_anomalies', 'discretionary_velocity', 'purchase_gate', 'recurring_dry_run', 'asset_liability_health', 'bulk_operations']) {
      expect(section(name)).toBeInTheDocument()
    }
    expect(within(section('spending_anomalies')).queryByText('기본 100,000 · 저장 미설정 · 적용 100,000')).not.toBeInTheDocument()
    openHelp('설명: 최소 변동 금액')
    expect(screen.getByText('이상 지출로 볼 수 있는 최소 월간 변동 금액입니다.')).toBeInTheDocument()
    expect(screen.getByText('기본 100,000 · 저장 미설정 · 적용 100,000')).toBeInTheDocument()
    openHelp('설명: 추가 확인 없는 최대 행 수')
    expect(screen.getByText('이 행 수를 넘는 일괄 작업은 추가 확인을 요구합니다.')).toBeInTheDocument()
    expect(screen.getByText('기본 100 · 저장 미설정 · 적용 100')).toBeInTheDocument()
    expect(within(section('bulk_operations')).getByRole('button', { name: '설명: 추가 확인 없는 최대 행 수' })).toBeInTheDocument()
    expect(within(section('bulk_operations')).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(section('bulk_operations')).queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('T013 남은 분석 설정 섹션마다 편집 컨트롤을 제공한다', () => {
    renderPage()
    expect(getByLabelPrefix('대형 구매 기준 (원)')).toHaveValue(100000)
    expect(getByLabelPrefix('최소 후보 금액 (원)')).toHaveValue(100000)
    expect(getByLabelPrefix('신규 가맹점 lookback (개월)')).toHaveValue(6)
    expect(getByLabelPrefix('가맹점 급증 기준 (%)')).toHaveValue(200)
    expect(getByLabelPrefix('재량 지출 급증 기준 (%)')).toHaveValue(150)
    expect(getByLabelPrefix('리뷰 cooldown (일)')).toHaveValue(14)
    expect(getByLabelPrefix('후보 위험 임계값')).toHaveValue('warning')
    expect(getByLabelPrefix('대형 단발 구매')).toBeChecked()

    expect(getByLabelPrefix('재량 기준 기간 (개월)')).toHaveValue(6)
    expect(getByLabelPrefix('재량 속도 경고 (%)')).toHaveValue(120)
    expect(getByLabelPrefix('재량 속도 높음 (%)')).toHaveValue(150)
    expect(getByLabelPrefix('분류 커버리지 최소 (%)')).toHaveValue(70)
    expect(screen.getAllByLabelText((content) => content.startsWith('제외 카테고리'))).toHaveLength(2)
    expect(screen.getAllByLabelText((content) => content.startsWith('제외 가맹점'))).toHaveLength(2)

    expect(getByLabelPrefix('최소 반복 횟수')).toHaveValue(2)
    expect(getByLabelPrefix('월간 간격 최소 (일)')).toHaveValue(25)
    expect(getByLabelPrefix('월간 간격 최대 (일)')).toHaveValue(35)
    expect(getByLabelPrefix('반복 신뢰도 최소 (%)')).toHaveValue(50)
    expect(getByLabelPrefix('반복 작업 기본 범위')).toHaveValue('all_matching')
    expect(getByLabelPrefix('업로드 후 자동 적용')).not.toBeChecked()

    expect(getByLabelPrefix('비상금 포함 tier')).toHaveValue('immediate')
    expect(getByLabelPrefix('near-liquid 보조 표시')).toBeChecked()
    expect(getByLabelPrefix('월상환 추정 lookback (개월)')).toHaveValue(6)
    expect(getByLabelPrefix('월상환 최소 관측')).toHaveValue(2)
    expect(getByLabelPrefix('부채 상환 확인 필요')).toBeChecked()
  })

  it('토글과 리스트 분석 설정에도 기본/저장/적용 helper 값을 표시한다', () => {
    renderPage()

    openHelp('설명: 활성 후보 유형')
    expect(screen.getByText('대형 단발, 신규 가맹점, 거래처 급증, 재량 지출 급증 중 어떤 신호를 후보로 만들지 정합니다.')).toBeInTheDocument()
    expect(screen.getByText('기본 대형 단발 구매, 신규 가맹점, 가맹점 급증, 재량 지출 급증 · 저장 미설정 · 적용 대형 단발 구매, 신규 가맹점, 가맹점 급증, 재량 지출 급증')).toBeInTheDocument()

    openHelp('설명: 업로드 후 자동 적용')
    expect(screen.getByText('업로드 직후 반복 결제 후보를 자동 적용할지 정합니다. 안전상 기본은 꺼짐입니다.')).toBeInTheDocument()
    expect(screen.getByText('기본 끔 · 저장 미설정 · 적용 끔')).toBeInTheDocument()

    openHelp('설명: 비상금 포함 tier')
    expect(screen.getByText('비상금 계산에 포함할 자산 유동성 tier 목록입니다.')).toBeInTheDocument()
    expect(screen.getByText('기본 immediate · 저장 미설정 · 적용 immediate')).toBeInTheDocument()

    openHelp('설명: near-liquid 보조 표시')
    expect(screen.getByText('즉시 현금화 자산 외 near-liquid 자산을 보조 지표로 함께 보여줄지 정합니다.')).toBeInTheDocument()
    expect(screen.getByText('기본 켬 · 저장 미설정 · 적용 켬')).toBeInTheDocument()
  })

  it('소수 퍼센트 표시값을 그대로 저장하면 spurious analytics PATCH를 만들지 않는다', async () => {
    settingsMock.analyticsSettingsResponse = withEffectiveRatios({
      purchase_gate: { merchant_spike_ratio: 1.2345, discretionary_spike_ratio: 1.5555 },
      discretionary_velocity: { warning_velocity_ratio: 1.2345, high_velocity_ratio: 1.5555, minimum_classification_coverage: 0.7654 },
      recurring_dry_run: { max_amount_cv: 0.1234, minimum_confidence: 0.8765 },
    })
    renderPage()

    expect(getByLabelPrefix('가맹점 급증 기준 (%)')).toHaveValue(123.45)
    expect(getByLabelPrefix('재량 지출 급증 기준 (%)')).toHaveValue(155.55)
    expect(getByLabelPrefix('금액 변동계수 최대 (%)')).toHaveValue(12.34)
    expect(getByLabelPrefix('반복 신뢰도 최소 (%)')).toHaveValue(87.65)

    fireEvent.click(screen.getByRole('button', { name: '분석 설정 저장' }))

    await waitFor(() => {
      expect(patchMutate).not.toHaveBeenCalled()
    })
  })

  it('저장 시 % → 비율 변환하여 PATCH한다', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '목표 저장' }))
    await waitFor(() => {
      expect(patchMutate).toHaveBeenCalledWith({
        financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
      })
    })
  })

  it('T013 분석 설정 저장 payload가 모든 편집 섹션과 퍼센트 변환을 포함한다', async () => {
    renderPage()
    changeField('대형 구매 기준 (원)', '250000')
    changeField('최소 후보 금액 (원)', '30000')
    changeField('신규 가맹점 lookback (개월)', '8')
    changeField('가맹점 급증 기준 (%)', '250')
    changeField('재량 지출 급증 기준 (%)', '175')
    changeField('리뷰 cooldown (일)', '30')
    changeField('후보 위험 임계값', 'high')
    fireEvent.click(within(section('purchase_gate')).getByLabelText('신규 가맹점'))
    fireEvent.change(within(section('purchase_gate')).getByLabelText((content) => content.startsWith('제외 카테고리')), { target: { value: '여행, 쇼핑' } })
    fireEvent.change(within(section('purchase_gate')).getByLabelText((content) => content.startsWith('제외 가맹점')), { target: { value: '면세점, 백화점' } })
    changeField('재량 기준 기간 (개월)', '4')
    changeField('재량 속도 경고 (%)', '130')
    changeField('재량 속도 높음 (%)', '180')
    changeField('분류 커버리지 최소 (%)', '80')
    changeField('outlier policy', 'none')
    changeField('baseline mode', 'closed_month')
    fireEvent.change(within(section('discretionary_velocity')).getByLabelText((content) => content.startsWith('제외 카테고리')), { target: { value: '식비, 여가' } })
    fireEvent.change(within(section('discretionary_velocity')).getByLabelText((content) => content.startsWith('제외 가맹점')), { target: { value: '쿠팡' } })
    changeField('최소 반복 횟수', '3')
    changeField('최소 반복 월수', '4')
    changeField('최소 반복 일수', '5')
    changeField('금액 변동계수 최대 (%)', '25')
    changeField('월간 간격 최소 (일)', '26')
    changeField('월간 간격 최대 (일)', '36')
    changeField('주간 간격 최소 (일)', '5')
    changeField('주간 간격 최대 (일)', '9')
    changeField('반복 신뢰도 최소 (%)', '90')
    changeField('반복 작업 기본 범위', 'reviewed_only')
    fireEvent.click(getByLabelPrefix('업로드 후 자동 적용'))
    changeField('비상금 포함 tier', 'immediate, near_liquid')
    fireEvent.click(getByLabelPrefix('near-liquid 보조 표시'))
    changeField('월상환 추정 lookback (개월)', '12')
    changeField('월상환 최소 관측', '4')
    fireEvent.click(getByLabelPrefix('부채 상환 확인 필요'))
    fireEvent.click(screen.getByRole('button', { name: '분석 설정 저장' }))

    await waitFor(() => {
      expect(patchMutate).toHaveBeenCalledWith({
        purchase_gate: {
          large_purchase_threshold: 250000,
          min_candidate_amount: 30000,
          new_merchant_lookback_months: 8,
          merchant_spike_ratio: 2.5,
          discretionary_spike_ratio: 1.75,
          review_cooldown_days: 30,
          candidate_risk_threshold: 'high',
          enabled_candidate_types: ['large_oneoff', 'merchant_spike', 'discretionary_spike'],
          excluded_category_names: ['여행', '쇼핑'],
          excluded_merchants: ['면세점', '백화점'],
        },
        discretionary_velocity: {
          baseline_months: 4,
          outlier_policy: 'none',
          warning_velocity_ratio: 1.3,
          high_velocity_ratio: 1.8,
          minimum_classification_coverage: 0.8,
          baseline_mode: 'closed_month',
          excluded_category_names: ['식비', '여가'],
          excluded_merchants: ['쿠팡'],
        },
        recurring_dry_run: {
          min_occurrences: 3,
          min_distinct_months: 4,
          min_distinct_days: 5,
          max_amount_cv: 0.25,
          monthly_interval_days_min: 26,
          monthly_interval_days_max: 36,
          weekly_interval_days_min: 5,
          weekly_interval_days_max: 9,
          minimum_confidence: 0.9,
          default_apply_scope: 'reviewed_only',
          upload_auto_apply: true,
        },
        asset_liability_health: {
          emergency_fund_included_tiers: ['immediate', 'near_liquid'],
          show_near_liquid_as_secondary: false,
          monthly_payment_estimate_lookback_months: 12,
          monthly_payment_min_observations: 4,
          debt_payment_confidence_requires_user_confirmation: false,
        },
      })
    })
  })

  it('잘못된 퍼센트와 음수 금액은 검증 오류를 보이고 PATCH하지 않는다', async () => {
    renderPage()
    fireEvent.change(getByLabelPrefix('분류 커버리지 최소 (%)'), { target: { value: '101' } })
    fireEvent.change(getByLabelPrefix('최소 후보 금액 (원)'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: '분석 설정 저장' }))

    await waitFor(() => {
      expect(screen.getByText('분류 커버리지 최소값은 0~100% 사이여야 합니다')).toBeInTheDocument()
      expect(screen.getByText('최소 후보 금액은 0원 이상이어야 합니다')).toBeInTheDocument()
    })
    expect(patchMutate).not.toHaveBeenCalled()
  })

  it('빈 필수 숫자 분석 설정은 검증 오류를 보이고 PATCH하지 않는다', async () => {
    renderPage()
    fireEvent.change(getByLabelPrefix('리뷰 cooldown (일)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '분석 설정 저장' }))

    await waitFor(() => {
      expect(screen.getByText('리뷰 cooldown은 숫자여야 합니다')).toBeInTheDocument()
    })
    expect(patchMutate).not.toHaveBeenCalled()
  })

  it('분석 설정 편집 중 background refetch가 들어와도 dirty draft를 덮어쓰지 않는다', () => {
    const view = render(settingsPage())
    fireEvent.change(getByLabelPrefix('대형 구매 기준 (원)'), { target: { value: '250000' } })

    settingsMock.analyticsSettingsResponse = {
      ...analyticsSettingsResponse,
      effective: {
        ...analyticsSettingsResponse.effective,
        purchase_gate: {
          ...analyticsSettingsResponse.effective.purchase_gate,
          min_candidate_amount: 90000,
        },
      },
    }
    view.rerender(settingsPage())

    expect(getByLabelPrefix('대형 구매 기준 (원)')).toHaveValue(250000)
  })
})
