import { memo } from 'react';
import { BreakdownPieChart } from '../components/charts/BreakdownPieChart';
import { CategoryTimelineAreaChart } from '../components/charts/CategoryTimelineAreaChart';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { MerchantTreemapChart } from '../components/charts/MerchantTreemapChart';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { SectionPlaceholder } from '../components/common/SectionPlaceholder';
import { TimelineRangeSlider } from '../components/filters/TimelineRangeSlider';
import {
  TransactionFilterBar,
  type TransactionFilterValues,
} from '../components/filters/TransactionFilterBar';
import { PageHeader } from '../components/layout/PageHeader';
import { TransactionsTable } from '../components/tables/TransactionsTable';
import {
  useSpendingPageState,
  useSpendingPeriodData,
  useSpendingTimelineData,
  useSpendingTransactionsData,
  type SpendingPageState,
} from '../hooks/useSpending';

function InlineSectionStatus({
  description,
  title,
  tone = 'muted',
}: {
  description: string;
  title: string;
  tone?: 'muted' | 'error';
}) {
  const toneClasses =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50/80 text-rose-700'
      : 'border-[color:var(--color-border)] bg-white/70 text-[color:var(--color-text-muted)]';

  return (
    <div className={`rounded-[1.5rem] border px-6 py-16 text-center ${toneClasses}`}>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6">{description}</p>
    </div>
  );
}

const MonthlyTimelineSection = memo(function MonthlyTimelineSection({
  timelineFilters,
  setTimelineFilters,
}: {
  timelineFilters: SpendingPageState['timeline_filters'];
  setTimelineFilters: SpendingPageState['updateTimelineFilters'];
}) {
  const timelineQuery = useSpendingTimelineData(timelineFilters);

  if (timelineQuery.isPending) {
    return (
      <section className="grid gap-6">
        <InlineSectionStatus
          title="월별 지출 시계열을 준비 중입니다"
          description="월별 카테고리 추이와 고정비/변동비 추이 섹션을 불러오고 있습니다."
        />
      </section>
    );
  }

  if (timelineQuery.isError || !timelineQuery.data) {
    return (
      <section className="grid gap-6">
        <InlineSectionStatus
          title="월별 시계열을 불러올 수 없습니다"
          description="잠시 후 다시 시도해 주세요."
          tone="error"
        />
      </section>
    );
  }

  const selectedStartMonth =
    timelineFilters.start_month || timelineQuery.data.available_months[0] || '-';
  const selectedEndMonth =
    timelineFilters.end_month ||
    timelineQuery.data.available_months[timelineQuery.data.available_months.length - 1] ||
    '-';

  return (
    <section className="grid gap-6">
      <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              월별 카테고리 추이
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              월별 지출을 카테고리별로 쌓아 비교합니다. 상위 카테고리 중심으로 보이고 나머지는 기타로 묶습니다.
            </p>
          </div>
          <TimelineRangeSlider
            months={timelineQuery.data.available_months}
            values={timelineFilters}
            onChange={setTimelineFilters}
            onReset={() => setTimelineFilters({ start_month: '', end_month: '' })}
          />
        </div>
        <div className="mt-6">
          <CategoryTimelineAreaChart
            data={timelineQuery.data.category_timeline.points}
            categories={timelineQuery.data.category_timeline.categories}
          />
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              월별 고정비/변동비 추이
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              고정비와 변동비 분류가 채워지면 월별 지출 시계열을 같은 기간 범위로 비교합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-[color:var(--color-text-subtle)]">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[color:var(--color-primary)]">
              {selectedStartMonth}
            </span>
            <span>~</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
              {selectedEndMonth}
            </span>
          </div>
        </div>
        <div className="mt-6">
          <SectionPlaceholder
            title="고정비/변동비 분류 데이터 준비 중"
            description="현재 슬라이더 기간과 동기화되도록 자리를 먼저 잡아두었고, 거래에 cost_kind 분류가 채워지면 area chart가 여기에 표시됩니다."
          />
        </div>
      </article>
    </section>
  );
});

const DetailFilterSection = memo(function DetailFilterSection({
  detailFilters,
  resetDetailFilters,
  setDetailFilters,
  paymentMethodOptions,
  categoryOptions,
}: {
  detailFilters: TransactionFilterValues;
  resetDetailFilters: SpendingPageState['resetDetailFilters'];
  setDetailFilters: SpendingPageState['updateDetailFilters'];
  paymentMethodOptions: string[];
  categoryOptions: string[];
}) {
  return (
    <>
      <TransactionFilterBar
        categoryOptions={categoryOptions}
        paymentMethodOptions={paymentMethodOptions}
        values={detailFilters}
        onApply={setDetailFilters}
        onReset={resetDetailFilters}
      />
      <p className="-mt-2 px-2 text-sm text-[color:var(--color-text-muted)]">
        기간은 아래 집계 카드와 거래 내역에 함께 적용되고, 카테고리·결제수단·검색은 거래 내역 필터로 사용됩니다.
      </p>
    </>
  );
});

const BreakdownSection = memo(function BreakdownSection({
  endMonth,
  startMonth,
  subcategoryMajorFilter,
  setSubcategoryMajorFilter,
}: {
  startMonth: string;
  endMonth: string;
  subcategoryMajorFilter: string;
  setSubcategoryMajorFilter: SpendingPageState['updateSubcategoryMajorFilter'];
}) {
  const breakdownQuery = useSpendingPeriodData(
    {
      start_month: startMonth,
      end_month: endMonth,
    },
    subcategoryMajorFilter,
  );

  if (breakdownQuery.isPending) {
    return (
      <section className="grid gap-6">
        <InlineSectionStatus
          title="기간 집계 카드를 준비 중입니다"
          description="카테고리, 하위 카테고리, 결제수단, 거래처 집계를 계산하고 있습니다."
        />
      </section>
    );
  }

  if (breakdownQuery.isError || !breakdownQuery.data) {
    return (
      <section className="grid gap-6">
        <InlineSectionStatus
          title="기간 집계를 불러올 수 없습니다"
          description="지출 집계 카드 데이터를 가져오지 못했습니다."
          tone="error"
        />
      </section>
    );
  }

  return (
    <>
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              카테고리별 지출
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              선택한 기간 기준 상위 카테고리 지출 금액을 비교합니다.
            </p>
          </div>
          <div className="mt-6">
            <HorizontalBarChart
              ariaLabel="카테고리별 지출 차트"
              data={breakdownQuery.data.category_breakdown}
              heightClassName="h-80"
            />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              하위 카테고리별 지출
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              선택한 기간 기준 소분류 지출을 그래프로 정리했습니다. 상위 카테고리를 먼저 고르면 해당 범위만 좁혀서 볼 수 있습니다.
            </p>
          </div>
          <div className="mt-5">
            <label className="block max-w-xs">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                상위 카테고리 필터
              </span>
              <select
                aria-label="상위 카테고리 필터"
                className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
                value={subcategoryMajorFilter}
                onChange={(event) => setSubcategoryMajorFilter(event.target.value)}
              >
                <option value="">전체</option>
                {breakdownQuery.data.filter_options.subcategory_major_categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6">
            <HorizontalBarChart
              ariaLabel="하위 카테고리별 지출 차트"
              data={breakdownQuery.data.subcategory_breakdown}
              heightClassName="h-96"
              labelWidth={160}
            />
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              고정비 필수/비필수 비율
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              고정비가 입력되면 필수/비필수 비율을 비교합니다.
            </p>
          </div>
          <div className="mt-6">
            <SectionPlaceholder
              title="고정비 세부 분류 대기 중"
              description="fixed_cost_necessity 값이 채워지면 비율 그래프가 여기에 표시됩니다."
            />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              변동비 비율
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              변동비 분류가 채워지면 월별 비중과 구성 변화를 확인합니다.
            </p>
          </div>
          <div className="mt-6">
            <SectionPlaceholder
              title="변동비 비율 데이터 준비 중"
              description="cost_kind 분류가 채워지면 변동비 비율 그래프가 여기에 표시됩니다."
            />
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              결제수단별 지출
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              같은 기간 기준 결제수단별 지출 금액을 비교합니다.
            </p>
          </div>
          <div className="mt-6 flex justify-center">
            <div className="w-full max-w-[28rem]">
              <BreakdownPieChart
                ariaLabel="결제수단별 지출 파이 차트"
                data={breakdownQuery.data.payment_methods}
              />
            </div>
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
              거래처별 Tree Map
            </h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              현재는 거래 설명 기준으로 지출 규모를 묶어 거래처 분포를 확인합니다.
            </p>
          </div>
          <div className="mt-6">
            <MerchantTreemapChart
              ariaLabel="거래처별 지출 트리맵"
              data={breakdownQuery.data.merchant_breakdown}
            />
          </div>
        </article>
      </section>
    </>
  );
});

const TransactionsSection = memo(function TransactionsSection({
  categoryMajor,
  endMonth,
  page,
  paymentMethod,
  perPage,
  search,
  setTransactionsPage,
  startMonth,
}: {
  startMonth: string;
  endMonth: string;
  categoryMajor: string;
  paymentMethod: string;
  search: string;
  page: number;
  perPage: number;
  setTransactionsPage: SpendingPageState['updateTransactionsPage'];
}) {
  const transactionsQuery = useSpendingTransactionsData(
    {
      start_month: startMonth,
      end_month: endMonth,
      category_major: categoryMajor,
      payment_method: paymentMethod,
      search,
    },
    page,
    perPage,
  );

  if (transactionsQuery.isPending) {
    return (
      <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <InlineSectionStatus
          title="거래 내역을 준비 중입니다"
          description="현재 필터 조건으로 거래 목록을 불러오고 있습니다."
        />
      </section>
    );
  }

  if (transactionsQuery.isError || !transactionsQuery.data) {
    return (
      <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <InlineSectionStatus
          title="거래 내역을 불러올 수 없습니다"
          description="현재 조건의 거래 목록을 가져오지 못했습니다."
          tone="error"
        />
      </section>
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(transactionsQuery.data.transactions_total / transactionsQuery.data.transactions_per_page),
  );

  return (
    <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-[color:var(--color-text)]">거래 내역</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
            현재 조건에 맞는 최근 지출 거래를 확인합니다.
          </p>
        </div>
        <p className="text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          {transactionsQuery.data.transactions_page} / {totalPages} 페이지
        </p>
      </div>

      <details className="mt-6 rounded-[1.5rem] border border-[color:var(--color-border)] bg-white/70">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[color:var(--color-text-muted)] marker:hidden">
          거래 내역 펼치기
        </summary>
        <div className="border-t border-[color:rgba(148,163,184,0.16)] px-5 py-5">
          <TransactionsTable rows={transactionsQuery.data.transactions} />
          <div className="mt-5 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setTransactionsPage(Math.max(1, transactionsQuery.data.transactions_page - 1))}
              disabled={transactionsQuery.data.transactions_page <= 1}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--color-text-muted)] transition enabled:hover:border-[color:var(--color-primary)] enabled:hover:text-[color:var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              이전 페이지
            </button>
            <p className="text-sm text-[color:var(--color-text-muted)]">
              총 {transactionsQuery.data.transactions_total}건 중{' '}
              {(transactionsQuery.data.transactions_page - 1) *
                transactionsQuery.data.transactions_per_page +
                1}
              {' '}-{' '}
              {Math.min(
                transactionsQuery.data.transactions_page *
                  transactionsQuery.data.transactions_per_page,
                transactionsQuery.data.transactions_total,
              )}
              건
            </p>
            <button
              type="button"
              onClick={() =>
                setTransactionsPage(
                  Math.min(totalPages, transactionsQuery.data.transactions_page + 1),
                )
              }
              disabled={transactionsQuery.data.transactions_page >= totalPages}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--color-text-muted)] transition enabled:hover:border-[color:var(--color-primary)] enabled:hover:text-[color:var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              다음 페이지
            </button>
          </div>
        </div>
      </details>
    </section>
  );
});

export function SpendingPage() {
  const spendingState = useSpendingPageState();
  const periodOptionsQuery = useSpendingPeriodData(
    {
      start_month: spendingState.detail_filters.start_month,
      end_month: spendingState.detail_filters.end_month,
    },
    '',
  );

  if (periodOptionsQuery.isError) {
    return (
      <ErrorState
        title="지출 데이터를 불러올 수 없습니다"
        description="지출 분석 화면에 필요한 집계 데이터를 가져오지 못했습니다."
        detail={periodOptionsQuery.error instanceof Error ? periodOptionsQuery.error.message : undefined}
      />
    );
  }

  if (!periodOptionsQuery.data && periodOptionsQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="지출"
          title="지출 분석"
          description="기간, 카테고리, 결제수단 기준으로 지출 흐름과 거래 내역을 확인합니다."
        />
        <InlineSectionStatus
          title="지출 분석 화면을 준비 중입니다"
          description="기간별 집계와 거래 목록을 차례대로 불러오고 있습니다."
        />
      </div>
    );
  }

  if (!periodOptionsQuery.data) {
    return (
      <EmptyState
        title="표시할 지출 데이터가 없습니다"
        description="거래가 적재되면 카테고리와 결제수단 분석 화면을 표시합니다."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="지출"
        title="지출 분석"
        description="기간, 카테고리, 결제수단 기준으로 지출 흐름과 거래 내역을 확인합니다."
      />

      <MonthlyTimelineSection
        timelineFilters={spendingState.timeline_filters}
        setTimelineFilters={spendingState.updateTimelineFilters}
      />

      <DetailFilterSection
        categoryOptions={periodOptionsQuery.data.filter_options.categories}
        paymentMethodOptions={periodOptionsQuery.data.filter_options.payment_methods}
        detailFilters={spendingState.detail_filters}
        resetDetailFilters={spendingState.resetDetailFilters}
        setDetailFilters={spendingState.updateDetailFilters}
      />

      <BreakdownSection
        startMonth={spendingState.detail_filters.start_month}
        endMonth={spendingState.detail_filters.end_month}
        subcategoryMajorFilter={spendingState.subcategory_major_filter}
        setSubcategoryMajorFilter={spendingState.updateSubcategoryMajorFilter}
      />

      <TransactionsSection
        startMonth={spendingState.detail_filters.start_month}
        endMonth={spendingState.detail_filters.end_month}
        categoryMajor={spendingState.detail_filters.category_major}
        paymentMethod={spendingState.detail_filters.payment_method}
        search={spendingState.detail_filters.search}
        page={spendingState.transactions_page}
        perPage={spendingState.transactions_per_page}
        setTransactionsPage={spendingState.updateTransactionsPage}
      />
    </div>
  );
}
