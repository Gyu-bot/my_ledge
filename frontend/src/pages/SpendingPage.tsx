import { CategoryTimelineAreaChart } from '../components/charts/CategoryTimelineAreaChart';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { TransactionFilterBar } from '../components/filters/TransactionFilterBar';
import { PageHeader } from '../components/layout/PageHeader';
import { TransactionsTable } from '../components/tables/TransactionsTable';
import { useSpending } from '../hooks/useSpending';

export function SpendingPage() {
  const spendingQuery = useSpending();

  if (spendingQuery.isPending) {
    return (
      <LoadingState
        title="지출 분석 불러오는 중"
        description="카테고리 집계와 결제수단 분석, 거래 목록을 가져오고 있습니다."
      />
    );
  }

  if (spendingQuery.isError) {
    return (
      <ErrorState
        title="지출 데이터를 불러올 수 없습니다"
        description="지출 분석 화면에 필요한 집계나 거래 데이터를 가져오지 못했습니다."
        detail={spendingQuery.error instanceof Error ? spendingQuery.error.message : undefined}
      />
    );
  }

  if (!spendingQuery.data) {
    return (
      <EmptyState
        title="표시할 지출 데이터가 없습니다"
        description="거래가 적재되면 카테고리와 결제수단 분석 화면을 표시합니다."
      />
    );
  }

  const { category_breakdown, category_timeline, filter_options, filters, payment_methods, transactions } =
    spendingQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="지출"
        title="지출 분석"
        description="기간, 카테고리, 결제수단 기준으로 지출 흐름과 거래 내역을 확인합니다."
      />

      <TransactionFilterBar
        categoryOptions={filter_options.categories}
        paymentMethodOptions={filter_options.payment_methods}
        values={filters}
        onApply={spendingQuery.updateFilters}
        onReset={spendingQuery.resetFilters}
      />

      <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              월별 카테고리 추이
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              월별 지출을 카테고리별로 쌓아 비교합니다. 상위 카테고리 중심으로 보이고 나머지는 기타로 묶습니다.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <CategoryTimelineAreaChart
            data={category_timeline.points}
            categories={category_timeline.categories}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
                카테고리별 지출
              </h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
                선택한 조건 기준 지출 금액이 큰 카테고리를 정리했습니다.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <HorizontalBarChart
              ariaLabel="Spending by category chart"
              data={category_breakdown}
            />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
                결제수단별 지출
              </h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
                같은 기간 기준 결제수단별 지출 금액을 비교합니다.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <HorizontalBarChart
              ariaLabel="Spending by payment method chart"
              data={payment_methods}
            />
          </div>
        </article>
      </section>

      <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">거래 내역</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              현재 조건에 맞는 최근 지출 거래를 확인합니다.
            </p>
          </div>
          <p className="text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            {transactions.length}건 표시
          </p>
        </div>
        <div className="mt-6">
          <TransactionsTable rows={transactions} />
        </div>
      </section>
    </div>
  );
}
