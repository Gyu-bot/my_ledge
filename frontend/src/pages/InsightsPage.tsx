import { useState } from 'react';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { AssumptionPopover } from '../components/insights/AssumptionPopover';
import { InsightSummaryCards } from '../components/insights/InsightSummaryCards';
import { RecurringPaymentsTable } from '../components/insights/RecurringPaymentsTable';
import { SpendingAnomaliesTable } from '../components/insights/SpendingAnomaliesTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
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
    <div className="flex items-center justify-between gap-4">
      <Button
        type="button"
        variant="outline"
        disabled={currentPage <= 1 || isFetching}
        aria-label={previousLabel}
        onClick={onPrevious}
      >
        이전
      </Button>
      <p className="text-sm text-[color:var(--color-text-muted)]">
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

  return (
    <div className="space-y-6">
      <PageHeader
        description="현금흐름, 수입 안정성, 반복 결제, 이상 지출을 진단 중심으로 정리합니다."
        eyebrow="분석"
        title="인사이트"
      />

      <InsightSummaryCards
        incomeStabilityAssumption={incomeStabilityAssumption}
        items={summary_cards}
      />

      <section>
        <Card>
          <CardHeader>
            <CardTitle>핵심 인사이트</CardTitle>
            <CardDescription className="mt-2">
              현재 데이터를 기준으로 가장 중요한 해석 포인트를 요약합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {key_insights.map((item) => (
              <div key={item.title} className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <p className="font-semibold text-[color:var(--color-text)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>반복 결제</CardTitle>
              {recurringPaymentsAssumption ? (
                <AssumptionPopover
                  ariaLabel="반복 결제 가정 보기"
                  content={recurringPaymentsAssumption}
                />
              ) : null}
            </div>
            <CardDescription className="mt-2">
              정기적으로 반복되는 결제 후보를 표 형태로 정리했습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>이상 지출</CardTitle>
              {spendingAnomaliesAssumption ? (
                <AssumptionPopover
                  ariaLabel="이상 지출 가정 보기"
                  content={spendingAnomaliesAssumption}
                />
              ) : null}
            </div>
            <CardDescription className="mt-2">
              baseline 대비 급증한 카테고리를 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>거래처 소비 Top N</CardTitle>
            <CardDescription className="mt-2">
              merchant spend 기준 상위 거래처를 요약했습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {merchant_spend.map((item) => (
              <div key={`${item.merchant}-${item.last_seen_at}`} className="flex items-center justify-between rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3">
                <div>
                  <p className="font-medium text-[color:var(--color-text)]">{item.merchant}</p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{item.count}건 · 평균 {formatMoney(item.avg_amount)}</p>
                </div>
                <Badge variant="secondary">{formatMoney(item.amount)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>카테고리 증감 요약</CardTitle>
            <CardDescription className="mt-2">
              전월 대비 증감이 큰 카테고리를 우선 노출합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {category_mom.map((item) => (
              <div key={`${item.period}-${item.category}`} className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-[color:var(--color-text)]">{item.category}</p>
                  <Badge variant={item.delta_amount >= 0 ? 'accent' : 'secondary'}>
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
