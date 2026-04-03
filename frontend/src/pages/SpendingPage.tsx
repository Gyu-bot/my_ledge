import { memo, useEffect, useMemo, useState } from 'react';
import { CategoryTimelineAreaChart } from '../components/charts/CategoryTimelineAreaChart';
import { DailySpendCalendar } from '../components/charts/DailySpendCalendar';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { MerchantTreemapChart } from '../components/charts/MerchantTreemapChart';
import { CardPeriodBadgeGroup } from '../components/common/CardPeriodBadgeGroup';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { IconTitle } from '../components/common/IconTitle';
import { SectionPlaceholder } from '../components/common/SectionPlaceholder';
import { TimelineRangeSlider } from '../components/filters/TimelineRangeSlider';
import {
  TransactionFilterBar,
  type TransactionFilterValues,
} from '../components/filters/TransactionFilterBar';
import { useAppChromeMeta } from '../components/layout/AppChromeContext';
import { TransactionsTable } from '../components/tables/TransactionsTable';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import {
  Card,
  CardContent,
  CardHeader,
} from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  useSpendingPageState,
  useSpendingDailyCalendarData,
  useSpendingPeriodData,
  useSpendingTimelineData,
  useSpendingTransactionsData,
  getSystemMonth,
  resolvePreferredMonth,
  type SpendingPageState,
} from '../hooks/useSpending';
import { Separator } from '../components/ui/separator';

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
      ? 'border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/70 text-[color:var(--color-danger)]'
      : 'border-[color:var(--color-primary-soft)] bg-[color:var(--color-primary-soft)]/18 text-[color:var(--color-text-muted)]';

  return (
    <div className={`rounded-[var(--radius)] border px-5 py-12 text-center ${toneClasses}`}>
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6">{description}</p>
    </div>
  );
}

const MonthlyTimelineSection = memo(function MonthlyTimelineSection({
  timelineData,
  timelineError,
  timelineFilters,
  timelinePending,
  setTimelineFilters,
}: {
  timelineData?: ReturnType<typeof useSpendingTimelineData>['data'];
  timelineError: boolean;
  timelineFilters: SpendingPageState['timeline_filters'];
  timelinePending: boolean;
  setTimelineFilters: SpendingPageState['updateTimelineFilters'];
}) {
  if (timelinePending) {
    return (
      <section className="grid gap-5">
        <InlineSectionStatus
          title="월별 지출 시계열을 준비 중입니다"
          description="월별 카테고리 추이와 고정비/변동비 추이 섹션을 불러오고 있습니다."
        />
      </section>
    );
  }

  if (timelineError || !timelineData) {
    return (
      <section className="grid gap-5">
        <InlineSectionStatus
          title="월별 시계열을 불러올 수 없습니다"
          description="잠시 후 다시 시도해 주세요."
          tone="error"
        />
      </section>
    );
  }

  const selectedStartMonth =
    timelineFilters.start_month || timelineData.available_months[0] || '-';
  const selectedEndMonth =
    timelineFilters.end_month ||
    timelineData.available_months[timelineData.available_months.length - 1] ||
    '-';

  return (
    <section className="space-y-5">
      <TimelineRangeSlider
        months={timelineData.available_months}
        values={timelineFilters}
        onApply={setTimelineFilters}
        onReset={() => setTimelineFilters({ start_month: '', end_month: '' })}
      />

      <div className="grid gap-5">
        <Card data-testid="monthly-category-timeline-card">
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="월별 지출을 카테고리별로 쌓아 비교합니다. 상위 카테고리 중심으로 보이고 나머지는 기타로 묶습니다."
              icon="presentationChartLine"
              title="월별 카테고리 추이"
            />
            <CardPeriodBadgeGroup
              ariaLabel="월별 카테고리 추이 적용 기간"
              end={selectedEndMonth}
              start={selectedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <CategoryTimelineAreaChart
              data={timelineData.category_timeline.points}
              categories={timelineData.category_timeline.categories}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="고정비와 변동비 분류가 채워지면 월별 지출 시계열을 같은 기간 범위로 비교합니다."
              icon="chartBar"
              title="월별 고정비/변동비 추이"
            />
            <CardPeriodBadgeGroup
              ariaLabel="월별 고정비/변동비 추이 적용 기간"
              end={selectedEndMonth}
              start={selectedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <SectionPlaceholder
              title="고정비/변동비 분류 데이터 준비 중"
              description="현재 슬라이더 기간과 동기화되도록 자리를 먼저 잡아두었고, 거래에 cost_kind 분류가 채워지면 area chart가 여기에 표시됩니다."
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
});

const DetailFilterSection = memo(function DetailFilterSection({
  detailFilters,
  resetDetailFilters,
  setDetailFilters,
}: {
  detailFilters: TransactionFilterValues;
  resetDetailFilters: SpendingPageState['resetDetailFilters'];
  setDetailFilters: SpendingPageState['updateDetailFilters'];
}) {
  return (
    <>
      <TransactionFilterBar
        values={detailFilters}
        onApply={setDetailFilters}
        onReset={resetDetailFilters}
      />
      <p className="-mt-2 px-2 text-sm text-[color:var(--color-text-muted)]">
        월 범위는 아래 집계 카드와 거래 내역에 함께 적용됩니다.
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
      <section className="grid gap-5">
        <InlineSectionStatus
          title="기간 집계 카드를 준비 중입니다"
          description="카테고리, 하위 카테고리, 거래처 집계를 계산하고 있습니다."
        />
      </section>
    );
  }

  if (breakdownQuery.isError || !breakdownQuery.data) {
    return (
      <section className="grid gap-5">
        <InlineSectionStatus
          title="기간 집계를 불러올 수 없습니다"
          description="지출 집계 카드 데이터를 가져오지 못했습니다."
          tone="error"
        />
      </section>
    );
  }

  const appliedStartMonth = startMonth || '기간 데이터 없음';
  const appliedEndMonth = endMonth || appliedStartMonth;

  return (
    <>
      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="선택한 기간 기준 상위 카테고리 지출 금액을 비교합니다."
              icon="chartBar"
              title="카테고리별 지출"
            />
            <CardPeriodBadgeGroup
              ariaLabel="카테고리별 지출 적용 기간"
              end={appliedEndMonth}
              start={appliedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              ariaLabel="카테고리별 지출 차트"
              data={breakdownQuery.data.category_breakdown}
              heightClassName="h-80"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="선택한 기간 기준 소분류 지출을 그래프로 정리했습니다. 상위 카테고리를 먼저 고르면 해당 범위만 좁혀서 볼 수 있습니다."
              icon="tag"
              title="하위 카테고리별 지출"
            />
            <CardPeriodBadgeGroup
              ariaLabel="하위 카테고리별 지출 적용 기간"
              end={appliedEndMonth}
              start={appliedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <label className="block max-w-xs">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                상위 카테고리 필터
              </span>
              <Select
                onValueChange={(value) => setSubcategoryMajorFilter(value === '__all__' ? '' : value)}
                value={subcategoryMajorFilter || '__all__'}
              >
                <SelectTrigger aria-label="상위 카테고리 필터" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {breakdownQuery.data.filter_options.subcategory_major_categories.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="mt-5">
              <HorizontalBarChart
                ariaLabel="하위 카테고리별 지출 차트"
                data={breakdownQuery.data.subcategory_breakdown}
                heightClassName="h-96"
                labelWidth={160}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="고정비가 입력되면 필수/비필수 비율을 비교합니다."
              icon="percentage"
              title="고정비 필수/비필수 비율"
            />
            <CardPeriodBadgeGroup
              ariaLabel="고정비 필수/비필수 비율 적용 기간"
              end={appliedEndMonth}
              start={appliedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <SectionPlaceholder
              title="고정비 세부 분류 대기 중"
              description="fixed_cost_necessity 값이 채워지면 비율 그래프가 여기에 표시됩니다."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="변동비 분류가 채워지면 월별 비중과 구성 변화를 확인합니다."
              icon="percentage"
              title="변동비 비율"
            />
            <CardPeriodBadgeGroup
              ariaLabel="변동비 비율 적용 기간"
              end={appliedEndMonth}
              start={appliedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <SectionPlaceholder
              title="변동비 비율 데이터 준비 중"
              description="cost_kind 분류가 채워지면 변동비 비율 그래프가 여기에 표시됩니다."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <IconTitle
              description="편집된 거래처 기준으로 지출 규모를 묶어 거래처 분포를 확인합니다."
              icon="buildingStorefront"
              title="거래처별 Tree Map"
            />
            <CardPeriodBadgeGroup
              ariaLabel="거래처별 Tree Map 적용 기간"
              end={appliedEndMonth}
              start={appliedStartMonth}
            />
          </CardHeader>
          <CardContent>
            <MerchantTreemapChart
              ariaLabel="거래처별 지출 트리맵"
              data={breakdownQuery.data.merchant_breakdown}
            />
          </CardContent>
        </Card>
      </section>
    </>
  );
});

const DailySpendSection = memo(function DailySpendSection({
  displayMode,
  endMonth,
  selectedMonth,
  startMonth,
  setDisplayMode,
  setSelectedMonth,
}: {
  displayMode: 'expense' | 'net';
  startMonth: string;
  endMonth: string;
  selectedMonth: string;
  setDisplayMode: (next: 'expense' | 'net') => void;
  setSelectedMonth: SpendingPageState['updateDailyCalendarMonth'];
}) {
  const includeIncome = displayMode === 'net';
  const dailyQuery = useSpendingDailyCalendarData(includeIncome, selectedMonth);

  if (dailyQuery.isPending) {
    return (
      <Card>
        <CardContent className="p-5">
          <InlineSectionStatus
            title="일별 지출 달력을 준비 중입니다"
            description="선택한 기간의 일자별 지출액을 집계하고 있습니다."
          />
        </CardContent>
      </Card>
    );
  }

  if (dailyQuery.isError || !dailyQuery.data) {
    return (
      <Card>
        <CardContent className="p-5">
          <InlineSectionStatus
            title="일별 지출 달력을 불러올 수 없습니다"
            description="일자별 지출 집계를 가져오지 못했습니다."
            tone="error"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0">
        <IconTitle
          description={
            includeIncome
              ? '선택한 기간 안에서 한 달을 골라 일자별 수입과 지출의 순변동을 달력으로 확인합니다.'
              : '선택한 기간 안에서 한 달을 골라 일자별 지출 금액을 달력으로 확인합니다.'
          }
          icon="calendarDays"
          title={includeIncome ? '일별 수입/지출액' : '일별 지출액'}
        />
        <div className="flex flex-wrap items-center gap-3">
          <CardPeriodBadgeGroup
            ariaLabel={`${includeIncome ? '일별 수입/지출액' : '일별 지출액'} 적용 기간`}
            end={endMonth || startMonth || '기간 데이터 없음'}
            start={startMonth || endMonth || '기간 데이터 없음'}
          />
          <label className="block min-w-[10rem]">
            <span className="sr-only">일별 카드 표시 기준</span>
            <Select
              onValueChange={(value) => setDisplayMode(value as 'expense' | 'net')}
              value={displayMode}
            >
              <SelectTrigger aria-label="일별 카드 표시 기준">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">지출만</SelectItem>
                <SelectItem value="net">수입 포함</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <Badge variant="reference">{dailyQuery.data.selected_month || '기간 데이터 없음'} 기준</Badge>
          <label className="block min-w-[10rem]">
            <span className="sr-only">일별 지출 월 선택</span>
            <Select
              onValueChange={setSelectedMonth}
              value={dailyQuery.data.selected_month || '__empty__'}
            >
              <SelectTrigger aria-label="일별 지출 월 선택">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dailyQuery.data.available_months.length === 0 ? (
                  <SelectItem disabled value="__empty__">
                    데이터 없음
                  </SelectItem>
                ) : (
                  dailyQuery.data.available_months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dailyQuery.data.selected_month ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3.5 py-3">
              <p className="text-sm text-[color:var(--color-text-muted)]">
                {includeIncome ? '총 일별 순변동 합계' : '총 일별 지출 합계'}
              </p>
              <p className="text-sm font-semibold text-[color:var(--color-text)]">
                {new Intl.NumberFormat('ko-KR', {
                  style: 'currency',
                  currency: 'KRW',
                  maximumFractionDigits: 0,
                }).format(dailyQuery.data.total_amount)}
              </p>
            </div>
            <DailySpendCalendar
              items={dailyQuery.data.items}
              maxAmount={dailyQuery.data.max_amount}
              month={dailyQuery.data.selected_month}
            />
          </>
        ) : (
          <InlineSectionStatus
            title="표시할 일별 지출 데이터가 없습니다"
            description="기간 필터를 조정하면 월별 달력 집계를 확인할 수 있습니다."
          />
        )}
      </CardContent>
    </Card>
  );
});

const TransactionsSection = memo(function TransactionsSection({
  endMonth,
  includeIncome,
  isAccordionOpen,
  page,
  perPage,
  setIncludeIncome,
  setTransactionsAccordionOpen,
  setTransactionsPage,
  startMonth,
}: {
  startMonth: string;
  endMonth: string;
  includeIncome: boolean;
  page: number;
  perPage: number;
  isAccordionOpen: boolean;
  setIncludeIncome: SpendingPageState['updateIncludeIncome'];
  setTransactionsPage: SpendingPageState['updateTransactionsPage'];
  setTransactionsAccordionOpen: SpendingPageState['updateTransactionsAccordionOpen'];
}) {
  const transactionsQuery = useSpendingTransactionsData(
    {
      start_month: startMonth,
      end_month: endMonth,
    },
    includeIncome,
    page,
    perPage,
  );

  if (transactionsQuery.isPending) {
    return (
      <Card>
        <CardContent className="p-5">
          <InlineSectionStatus
            title="거래 내역을 준비 중입니다"
            description="현재 필터 조건으로 거래 목록을 불러오고 있습니다."
          />
        </CardContent>
      </Card>
    );
  }

  if (transactionsQuery.isError || !transactionsQuery.data) {
    return (
      <Card>
        <CardContent className="p-5">
          <InlineSectionStatus
            title="거래 내역을 불러올 수 없습니다"
            description="현재 조건의 거래 목록을 가져오지 못했습니다."
            tone="error"
          />
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(transactionsQuery.data.transactions_total / transactionsQuery.data.transactions_per_page),
  );

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
        <IconTitle
          description={
            includeIncome
              ? '현재 조건에 맞는 수입·지출 거래를 함께 확인합니다.'
              : '현재 조건에 맞는 최근 지출 거래를 확인합니다.'
          }
          icon="workbench"
          title="거래 내역"
        />
        <div className="flex flex-wrap items-center gap-3">
          <CardPeriodBadgeGroup
            ariaLabel="거래 내역 적용 기간"
            end={endMonth || startMonth || '기간 데이터 없음'}
            start={startMonth || endMonth || '기간 데이터 없음'}
          />
          <label className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text)]">
            <Checkbox
              aria-label="거래내역 수입 포함"
              checked={includeIncome}
              onCheckedChange={(checked) => setIncludeIncome(checked === true)}
            />
            수입 포함
          </label>
          <p className="text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            {transactionsQuery.data.transactions_page} / {totalPages} 페이지
            {transactionsQuery.isFetching ? ' · 불러오는 중' : ''}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion
          collapsible
          type="single"
          value={isAccordionOpen ? 'transactions' : undefined}
          onValueChange={(value) => setTransactionsAccordionOpen(value === 'transactions')}
        >
          <AccordionItem value="transactions">
            <AccordionTrigger>{isAccordionOpen ? '거래 내역 접기' : '거래 내역 펼치기'}</AccordionTrigger>
            <AccordionContent>
              <TransactionsTable rows={transactionsQuery.data.transactions} />
              <div className="mt-4 flex items-center justify-between gap-4">
                <Button
                  type="button"
                  onClick={() =>
                    setTransactionsPage(Math.max(1, transactionsQuery.data.transactions_page - 1))
                  }
                  disabled={transactionsQuery.data.transactions_page <= 1 || transactionsQuery.isFetching}
                  variant="outline"
                >
                  이전 페이지
                </Button>
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
                <Button
                  type="button"
                  onClick={() =>
                    setTransactionsPage(
                      Math.min(totalPages, transactionsQuery.data.transactions_page + 1),
                    )
                  }
                  disabled={transactionsQuery.data.transactions_page >= totalPages || transactionsQuery.isFetching}
                  variant="outline"
                >
                  다음 페이지
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
});

export function SpendingPage() {
  const spendingState = useSpendingPageState();
  const detailFilters = spendingState.detail_filters;
  const updateDetailFilters = spendingState.updateDetailFilters;
  const [dailyCalendarMonth, setDailyCalendarMonth] = useState(() => spendingState.daily_calendar_month);
  const [dailyCardDisplayMode, setDailyCardDisplayMode] = useState<'expense' | 'net'>('expense');
  const detailRangeLabel =
    detailFilters.start_month && detailFilters.end_month
      ? detailFilters.start_month === detailFilters.end_month
        ? `상세 범위 ${detailFilters.start_month}`
        : `상세 범위 ${detailFilters.start_month} ~ ${detailFilters.end_month}`
      : '상세 범위 미지정';
  const timelineQuery = useSpendingTimelineData(spendingState.timeline_filters);
  const periodOptionsQuery = useSpendingPeriodData(
    {
      start_month: detailFilters.start_month,
      end_month: detailFilters.end_month,
    },
    '',
  );
  const chromeMeta = useMemo(
    () => <Badge variant="reference">{detailRangeLabel}</Badge>,
    [detailRangeLabel],
  );
  useAppChromeMeta(chromeMeta);

  useEffect(() => {
    if (!timelineQuery.data?.available_months.length) {
      return;
    }

    const systemMonth = getSystemMonth();
    const preferredMonth = resolvePreferredMonth(timelineQuery.data.available_months, systemMonth);

    if (!preferredMonth) {
      return;
    }

    const shouldRebaseDetailRange =
      detailFilters.start_month === systemMonth &&
      detailFilters.end_month === systemMonth &&
      !timelineQuery.data.available_months.includes(systemMonth);

    if (shouldRebaseDetailRange) {
      updateDetailFilters({
        ...detailFilters,
        start_month: preferredMonth,
        end_month: preferredMonth,
      });
    }

    const shouldSyncDailyMonth =
      (dailyCalendarMonth === systemMonth &&
        !timelineQuery.data.available_months.includes(systemMonth)) ||
      !dailyCalendarMonth;

    if (shouldSyncDailyMonth && dailyCalendarMonth !== preferredMonth) {
      setDailyCalendarMonth(preferredMonth);
    }
  }, [
    dailyCalendarMonth,
    detailFilters,
    timelineQuery.data,
    updateDetailFilters,
  ]);

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
      <div className="space-y-5">
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
    <div className="space-y-5">
      <MonthlyTimelineSection
        timelineData={timelineQuery.data}
        timelineError={timelineQuery.isError}
        timelineFilters={spendingState.timeline_filters}
        timelinePending={timelineQuery.isPending}
        setTimelineFilters={spendingState.updateTimelineFilters}
      />

      <div className="space-y-3" data-testid="spending-detail-scope-separator">
        <div className="flex items-center gap-4">
          <p className="shrink-0 text-xs font-semibold tracking-[0.18em] text-[color:var(--color-text-subtle)]">
            아래 카드부터 월 필터 적용
          </p>
          <Separator />
        </div>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          카테고리별, 거래처별, 거래 내역은 아래 월 범위를 기준으로 함께 집계됩니다.
        </p>
      </div>

      <DetailFilterSection
        detailFilters={detailFilters}
        resetDetailFilters={spendingState.resetDetailFilters}
        setDetailFilters={spendingState.updateDetailFilters}
      />

      <BreakdownSection
        startMonth={detailFilters.start_month}
        endMonth={detailFilters.end_month}
        subcategoryMajorFilter={spendingState.subcategory_major_filter}
        setSubcategoryMajorFilter={spendingState.updateSubcategoryMajorFilter}
      />

      <DailySpendSection
        displayMode={dailyCardDisplayMode}
        startMonth={detailFilters.start_month}
        endMonth={detailFilters.end_month}
        selectedMonth={dailyCalendarMonth}
        setDisplayMode={setDailyCardDisplayMode}
        setSelectedMonth={setDailyCalendarMonth}
      />

      <TransactionsSection
        startMonth={detailFilters.start_month}
        endMonth={detailFilters.end_month}
        includeIncome={spendingState.include_income}
        page={spendingState.transactions_page}
        perPage={spendingState.transactions_per_page}
        isAccordionOpen={spendingState.transactions_accordion_open}
        setIncludeIncome={spendingState.updateIncludeIncome}
        setTransactionsAccordionOpen={spendingState.updateTransactionsAccordionOpen}
        setTransactionsPage={spendingState.updateTransactionsPage}
      />
    </div>
  );
}
