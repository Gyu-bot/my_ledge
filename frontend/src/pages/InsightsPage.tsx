import { useMemo, useState } from 'react';
import { CardPeriodBadgeGroup } from '../components/common/CardPeriodBadgeGroup';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { IconTitle } from '../components/common/IconTitle';
import { LoadingState } from '../components/common/LoadingState';
import { getCardGroupSurfaceClass } from '../components/common/cardGroupSurface';
import { AssumptionPopover } from '../components/insights/AssumptionPopover';
import { InsightSummaryCards } from '../components/insights/InsightSummaryCards';
import { RecurringPaymentsTable } from '../components/insights/RecurringPaymentsTable';
import { SpendingAnomaliesTable } from '../components/insights/SpendingAnomaliesTable';
import { useAppChromeMeta } from '../components/layout/AppChromeContext';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '../components/ui/card';
import { cn } from '../lib/utils';
import {
  INSIGHTS_CARD_PAGE_SIZE,
  useInsights,
  useRecurringPaymentsPage,
  useSpendingAnomaliesPage,
} from '../hooks/useInsights';

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

function findAssumption(assumptions: string[], key: string) {
  const prefix = `${key}:`;
  const match = assumptions.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function toMonthKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  return value.slice(0, 7);
}

function getMerchantSpendPeriod(items: Array<{ last_seen_at: string }>) {
  const months = items
    .map((item) => toMonthKey(item.last_seen_at))
    .filter((value): value is string => value !== null)
    .sort();

  if (months.length === 0) {
    return {
      start: '기간 정보 없음',
      end: '기간 정보 없음',
    };
  }

  return {
    start: months[0],
    end: months[months.length - 1],
  };
}

function getCategoryMoMPeriod(items: Array<{ previous_period: string; period: string }>) {
  const months = items
    .flatMap((item) => [item.previous_period, item.period])
    .filter(Boolean)
    .sort();

  if (months.length === 0) {
    return {
      start: '기간 정보 없음',
      end: '기간 정보 없음',
    };
  }

  return {
    start: months[0],
    end: months[months.length - 1],
  };
}

interface InsightCardPaginationProps {
  currentPage: number;
  totalItems: number;
  perPage: number;
  isFetching: boolean;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}

function InsightCardPagination({
  currentPage,
  totalItems,
  perPage,
  isFetching,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: InsightCardPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Button
        type="button"
        variant="outline"
        disabled={currentPage <= 1 || isFetching}
        aria-label={previousLabel}
        onClick={onPrevious}
      >
        이전
      </Button>
      <p className="min-w-0 text-sm text-[color:var(--color-text-muted)]">
        {currentPage} / {totalPages} 페이지 · 총 {totalItems}건
        {isFetching ? ' · 불러오는 중' : ''}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={currentPage >= totalPages || isFetching}
        aria-label={nextLabel}
        onClick={onNext}
      >
        다음
      </Button>
    </div>
  );
}

export function InsightsPage() {
  const [recurringPage, setRecurringPage] = useState(1);
  const [anomalyPage, setAnomalyPage] = useState(1);
  const insightsQuery = useInsights();
  const recurringQuery = useRecurringPaymentsPage(recurringPage, INSIGHTS_CARD_PAGE_SIZE);
  const anomalyQuery = useSpendingAnomaliesPage(anomalyPage, INSIGHTS_CARD_PAGE_SIZE);
  const chromeMeta = useMemo(
    () =>
      insightsQuery.data ? (
        <Badge variant="reference">핵심 인사이트 {insightsQuery.data.key_insights.length}건</Badge>
      ) : null,
    [insightsQuery.data],
  );
  useAppChromeMeta(chromeMeta);

  if (insightsQuery.isPending) {
    return (
      <LoadingState
        title="인사이트 불러오는 중"
        description="advisor analytics 기반 진단 카드와 반복 결제, 이상 지출을 불러오고 있습니다."
      />
    );
  }

  if (insightsQuery.isError) {
    return (
      <ErrorState
        title="인사이트 데이터를 불러올 수 없습니다"
        description="진단 카드와 이상 탐지 데이터를 가져오지 못했습니다."
        detail={insightsQuery.error instanceof Error ? insightsQuery.error.message : undefined}
      />
    );
  }

  if (!insightsQuery.data) {
    return (
      <EmptyState
        title="표시할 인사이트가 없습니다"
        description="analytics endpoint 응답이 준비되면 이 화면에서 진단 결과를 보여줍니다."
      />
    );
  }

  const { assumptions, category_mom, key_insights, merchant_spend, recurring_payments, spending_anomalies, summary_cards } =
    insightsQuery.data;
  const incomeStabilityAssumption = findAssumption(assumptions, 'income-stability');
  const recurringPaymentsAssumption = findAssumption(assumptions, 'recurring-payments');
  const spendingAnomaliesAssumption = findAssumption(assumptions, 'spending-anomalies');
  const recurringPageData = recurringQuery.data;
  const anomalyPageData = anomalyQuery.data;
  const recurringItems = recurringPageData?.items ?? recurring_payments;
  const anomalyItems = anomalyPageData?.items ?? spending_anomalies;
  const recurringTotal = recurringPageData?.total ?? recurring_payments.length;
  const anomalyTotal = anomalyPageData?.total ?? spending_anomalies.length;
  const recurringCurrentPage = recurringPageData?.page ?? 1;
  const anomalyCurrentPage = anomalyPageData?.page ?? 1;
  const merchantSpendPeriod = getMerchantSpendPeriod(merchant_spend);
  const categoryMoMPeriod = getCategoryMoMPeriod(category_mom);

  return (
    <div className="space-y-5">
      <InsightSummaryCards
        incomeStabilityAssumption={incomeStabilityAssumption}
        items={summary_cards}
      />

      <section>
        <Card>
          <CardHeader>
            <IconTitle
              description="현재 데이터를 기준으로 가장 중요한 해석 포인트를 요약합니다."
              icon="insights"
              title="핵심 인사이트"
            />
          </CardHeader>
          <CardContent className="space-y-3">
            {key_insights.map((item) => (
              <div
                key={item.title}
                className={cn(
                  'rounded-[var(--radius)] border p-3.5',
                  getCardGroupSurfaceClass('primary'),
                )}
              >
                <p className="font-semibold text-[color:var(--color-text)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0 w-full overflow-hidden">
          <CardHeader className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <IconTitle className="flex-1" icon="arrowPath" title="반복 결제" />
              {recurringPaymentsAssumption ? (
                <AssumptionPopover
                  ariaLabel="반복 결제 가정 보기"
                  content={recurringPaymentsAssumption}
                />
              ) : null}
            </div>
            <CardDescription>정기적으로 반복되는 결제 후보를 표 형태로 정리했습니다.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <RecurringPaymentsTable items={recurringItems} />
            <InsightCardPagination
              currentPage={recurringCurrentPage}
              totalItems={recurringTotal}
              perPage={INSIGHTS_CARD_PAGE_SIZE}
              isFetching={recurringQuery.isFetching}
              previousLabel="반복 결제 이전 페이지"
              nextLabel="반복 결제 다음 페이지"
              onPrevious={() => setRecurringPage(Math.max(1, recurringCurrentPage - 1))}
              onNext={() =>
                setRecurringPage(
                  Math.min(
                    Math.max(1, Math.ceil(recurringTotal / INSIGHTS_CARD_PAGE_SIZE)),
                    recurringCurrentPage + 1,
                  ),
                )
              }
            />
          </CardContent>
        </Card>

        <Card className="min-w-0 w-full overflow-hidden">
          <CardHeader className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <IconTitle className="flex-1" icon="exclamationTriangle" title="이상 지출" />
              {spendingAnomaliesAssumption ? (
                <AssumptionPopover
                  ariaLabel="이상 지출 가정 보기"
                  content={spendingAnomaliesAssumption}
                />
              ) : null}
            </div>
            <CardDescription>baseline 대비 급증한 카테고리를 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <SpendingAnomaliesTable items={anomalyItems} />
            <InsightCardPagination
              currentPage={anomalyCurrentPage}
              totalItems={anomalyTotal}
              perPage={INSIGHTS_CARD_PAGE_SIZE}
              isFetching={anomalyQuery.isFetching}
              previousLabel="이상 지출 이전 페이지"
              nextLabel="이상 지출 다음 페이지"
              onPrevious={() => setAnomalyPage(Math.max(1, anomalyCurrentPage - 1))}
              onNext={() =>
                setAnomalyPage(
                  Math.min(
                    Math.max(1, Math.ceil(anomalyTotal / INSIGHTS_CARD_PAGE_SIZE)),
                    anomalyCurrentPage + 1,
                  ),
                )
              }
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="merchant spend 기준 상위 거래처를 요약했습니다."
              icon="buildingStorefront"
              title="거래처 소비 Top N"
            />
            <CardPeriodBadgeGroup
              ariaLabel="거래처 소비 Top N 적용 기간"
              end={merchantSpendPeriod.end}
              start={merchantSpendPeriod.start}
            />
          </CardHeader>
          <CardContent className="space-y-3">
            {merchant_spend.map((item) => (
              <div
                key={`${item.merchant}-${item.last_seen_at}`}
                className={cn(
                  'flex min-w-0 items-start justify-between gap-3 rounded-[var(--radius)] border px-4 py-3',
                  getCardGroupSurfaceClass('secondary'),
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[color:var(--color-text)]" title={item.merchant}>
                    {item.merchant}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                    {item.count}건 · 평균 {formatMoney(item.avg_amount)}
                  </p>
                </div>
                <Badge className="shrink-0" variant="secondary">{formatMoney(item.amount)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="전월 대비 증감이 큰 카테고리를 우선 노출합니다."
              icon="arrowsRightLeft"
              title="카테고리 증감 요약"
            />
            <CardPeriodBadgeGroup
              ariaLabel="카테고리 증감 요약 적용 기간"
              end={categoryMoMPeriod.end}
              start={categoryMoMPeriod.start}
            />
          </CardHeader>
          <CardContent className="space-y-3">
            {category_mom.map((item) => (
              <div
                key={`${item.period}-${item.category}`}
                className={cn(
                  'rounded-[var(--radius)] border p-3.5',
                  getCardGroupSurfaceClass(item.delta_amount >= 0 ? 'accent' : 'secondary'),
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-[color:var(--color-text)]" title={item.category}>
                    {item.category}
                  </p>
                  <Badge className="shrink-0" variant={item.delta_amount >= 0 ? 'accent' : 'secondary'}>
                    {item.delta_amount >= 0 ? '+' : ''}
                    {formatMoney(item.delta_amount)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                  {item.previous_period} 대비 {item.period} {formatMoney(item.current_amount)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
