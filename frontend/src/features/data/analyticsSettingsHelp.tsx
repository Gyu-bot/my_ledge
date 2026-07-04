import * as Popover from '@radix-ui/react-popover'
import { Info } from 'lucide-react'

type SettingHelp = {
  readonly title: string
  readonly description: string
}

export const SETTING_HELP = {
  purchaseLargeThreshold: {
    title: '대형 구매 기준',
    description: '단발성 큰 지출 후보를 잡는 금액 기준입니다. 기준 이상이면 purchase gate 후보로 더 강하게 표시됩니다.',
  },
  purchaseMinCandidate: {
    title: '최소 후보 금액',
    description: '너무 작은 거래를 후보에서 제외하는 하한입니다. 낮출수록 더 많은 거래가 검토 대상에 들어옵니다.',
  },
  purchaseNewMerchantLookback: {
    title: '신규 가맹점 lookback',
    description: '최근 몇 개월 동안 보이지 않았던 거래처를 신규 가맹점으로 볼지 정하는 기간입니다.',
  },
  purchaseMerchantSpike: {
    title: '가맹점 급증 기준',
    description: '같은 거래처 지출이 기준 대비 몇 배 이상 늘었을 때 급증 후보로 볼지 정합니다.',
  },
  purchaseDiscretionarySpike: {
    title: '재량 지출 급증 기준',
    description: '비필수 소비 흐름이 평소보다 크게 늘어난 달을 purchase gate 후보로 올리는 기준입니다.',
  },
  purchaseReviewCooldown: {
    title: '리뷰 cooldown',
    description: '이미 검토한 후보를 다시 띄우기 전 기다리는 기간입니다. 짧을수록 같은 후보가 자주 보일 수 있습니다.',
  },
  purchaseRiskThreshold: {
    title: '후보 위험 임계값',
    description: 'watch, warning, high 중 어느 등급부터 주요 후보로 다룰지 정합니다.',
  },
  purchaseExcludedCategories: {
    title: '제외 카테고리',
    description: 'purchase gate 후보 계산에서 제외할 카테고리 목록입니다. 쉼표로 여러 값을 입력합니다.',
  },
  purchaseExcludedMerchants: {
    title: '제외 가맹점',
    description: 'purchase gate 후보 계산에서 제외할 거래처 목록입니다. 반복적으로 예외 처리할 곳에 사용합니다.',
  },
  purchaseCandidateTypes: {
    title: '활성 후보 유형',
    description: '대형 단발, 신규 가맹점, 거래처 급증, 재량 지출 급증 중 어떤 신호를 후보로 만들지 정합니다.',
  },
  velocityBaselineMonths: {
    title: '재량 기준 기간',
    description: '재량 지출 속도를 비교할 과거 기준 기간입니다. 길수록 완만하고 짧을수록 최근 변화에 민감합니다.',
  },
  velocityWarningRatio: {
    title: '재량 속도 경고',
    description: '현재 재량 지출 속도가 기준 대비 이 비율을 넘으면 warning으로 판단합니다.',
  },
  velocityHighRatio: {
    title: '재량 속도 높음',
    description: '현재 재량 지출 속도가 기준 대비 이 비율을 넘으면 high로 판단합니다.',
  },
  velocityCoverage: {
    title: '분류 커버리지 최소',
    description: '카테고리 분류가 충분하지 않은 기간을 재량 속도 판단에서 낮은 신뢰도로 다루는 기준입니다.',
  },
  velocityOutlierPolicy: {
    title: 'outlier policy',
    description: '기준 기간을 만들 때 튀는 월을 어떻게 제외하거나 완화할지 정하는 정책명입니다.',
  },
  velocityBaselineMode: {
    title: 'baseline mode',
    description: '마감월, 진행월 보정 등 기준선을 계산하는 방식을 정합니다.',
  },
  velocityExcludedCategories: {
    title: '제외 카테고리',
    description: '재량 지출 속도 계산에서 제외할 카테고리 목록입니다.',
  },
  velocityExcludedMerchants: {
    title: '제외 가맹점',
    description: '재량 지출 속도 계산에서 제외할 거래처 목록입니다.',
  },
  recurringMinOccurrences: {
    title: '최소 반복 횟수',
    description: '반복 결제로 후보화되기 위해 필요한 최소 거래 횟수입니다.',
  },
  recurringMinMonths: {
    title: '최소 반복 월수',
    description: '반복 결제가 여러 달에 걸쳐 나타났는지 확인하는 최소 월수입니다.',
  },
  recurringMinDays: {
    title: '최소 반복 일수',
    description: '같은 날 중복 거래만으로 반복 결제가 되는 것을 줄이기 위한 최소 서로 다른 일수입니다.',
  },
  recurringAmountCv: {
    title: '금액 변동계수 최대',
    description: '반복 결제로 보기 위해 허용하는 금액 흔들림입니다. 낮을수록 같은 금액에 가깝게 봅니다.',
  },
  recurringMonthlyMin: {
    title: '월간 간격 최소',
    description: '월간 반복으로 볼 거래 간격의 최소 일수입니다.',
  },
  recurringMonthlyMax: {
    title: '월간 간격 최대',
    description: '월간 반복으로 볼 거래 간격의 최대 일수입니다.',
  },
  recurringWeeklyMin: {
    title: '주간 간격 최소',
    description: '주간 반복으로 볼 거래 간격의 최소 일수입니다.',
  },
  recurringWeeklyMax: {
    title: '주간 간격 최대',
    description: '주간 반복으로 볼 거래 간격의 최대 일수입니다.',
  },
  recurringConfidence: {
    title: '반복 신뢰도 최소',
    description: '반복 결제 후보를 적용하거나 보여주기 위한 최소 신뢰도입니다.',
  },
  recurringApplyScope: {
    title: '반복 작업 기본 범위',
    description: '반복 결제 후보를 적용할 때 기본으로 전체 매칭을 볼지, 검토된 항목만 볼지 정합니다.',
  },
  recurringUploadAutoApply: {
    title: '업로드 후 자동 적용',
    description: '업로드 직후 반복 결제 후보를 자동 적용할지 정합니다. 안전상 기본은 꺼짐입니다.',
  },
  assetEmergencyTiers: {
    title: '비상금 포함 tier',
    description: '비상금 계산에 포함할 자산 유동성 tier 목록입니다.',
  },
  assetNearLiquidSecondary: {
    title: 'near-liquid 보조 표시',
    description: '즉시 현금화 자산 외 near-liquid 자산을 보조 지표로 함께 보여줄지 정합니다.',
  },
  assetPaymentLookback: {
    title: '월상환 추정 lookback',
    description: '부채 월상환 추정에 사용할 최근 개월 수입니다.',
  },
  assetPaymentObservations: {
    title: '월상환 최소 관측',
    description: '월상환액을 추정하기 위해 필요한 최소 관측 거래 수입니다.',
  },
  assetPaymentConfirmation: {
    title: '부채 상환 확인 필요',
    description: '부채 상환 추정값을 신뢰하려면 사용자 확인이 필요한지 정합니다.',
  },
  anomalyMinDelta: {
    title: '최소 변동 금액',
    description: '이상 지출로 볼 수 있는 최소 월간 변동 금액입니다.',
  },
  anomalyThreshold: {
    title: '이상 기준',
    description: '기준 지출 대비 어느 정도 커져야 이상 지출로 볼지 정하는 비율입니다.',
  },
  anomalyBaselineMonths: {
    title: '기준 기간',
    description: '이상 지출 판단에 사용할 과거 기준 개월 수입니다.',
  },
  bulkPreview: {
    title: '미리보기 필수',
    description: '일괄 작업 전에 변경 내용을 먼저 확인하게 하는 안전장치입니다.',
  },
  bulkConfirmation: {
    title: '확인 입력 필수',
    description: '위험한 일괄 작업 전에 추가 확인 입력을 요구하는 안전장치입니다.',
  },
  bulkUndo: {
    title: '삭제 후 되돌리기 표시',
    description: '삭제성 작업 후 되돌리기 동선을 노출할지 정합니다.',
  },
  bulkMaxRows: {
    title: '추가 확인 없는 최대 행 수',
    description: '이 행 수를 넘는 일괄 작업은 추가 확인을 요구합니다.',
  },
} as const

export type SettingHelpKey = keyof typeof SETTING_HELP

type SettingHelpBubbleProps = {
  readonly help: SettingHelp
  readonly values: string
}

export function SettingHelpBubble({ help, values }: SettingHelpBubbleProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`설명: ${help.title}`}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-subtle text-text-faint transition-colors duration-fast hover:border-border-strong hover:text-text-secondary focus-visible:border-accent focus-visible:outline-none"
          onClick={(event) => event.stopPropagation()}
        >
          <Info aria-hidden="true" className="h-3 w-3" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-md border border-border bg-bg-surface p-3 text-left shadow-lg outline-none"
        >
          <div className="text-caption font-medium text-text-secondary">{help.title}</div>
          <p className="mt-1 text-micro leading-relaxed text-text-muted">{help.description}</p>
          <div className="mt-2 rounded-sm border border-border-subtle bg-bg-inset px-2 py-1.5 text-micro text-text-faint">
            {values}
          </div>
          <Popover.Arrow className="fill-[var(--ds-bg-surface)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
