import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { useMemo } from 'react';
import { CardPeriodBadgeGroup } from '../components/common/CardPeriodBadgeGroup';
import { ChartTooltipContent } from '../components/charts/ChartTooltipContent';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { IconTitle } from '../components/common/IconTitle';
import { LoadingState } from '../components/common/LoadingState';
import { getCardGroupSurfaceClass } from '../components/common/cardGroupSurface';
import { useAppChromeMeta } from '../components/layout/AppChromeContext';
import { MetricCardGrid } from '../components/layout/MetricCardGrid';
import { TransactionsTable } from '../components/tables/TransactionsTable';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { useOverview } from '../hooks/useOverview';
import {
  CHART_ACCENT,
  CHART_BAR_RADIUS_VERTICAL,
  CHART_COMPLEMENTARY,
  CHART_SECONDARY,
} from '../components/charts/chartTheme';
import { cn } from '../lib/utils';

function formatMoney(value: number | string | readonly (number | string)[] | null | undefined) {
  const normalized = Array.isArray(value) && value.length > 0 ? value[0] : (value ?? 0);
  const numericValue = typeof normalized === 'number' ? normalized : Number(normalized);
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

export function OverviewPage() {
  const overviewQuery = useOverview();
  const chromeMeta = useMemo(
    () =>
      overviewQuery.data?.snapshot_date ? (
        <Badge variant="reference">기준일 {overviewQuery.data.snapshot_date}</Badge>
      ) : null,
    [overviewQuery.data?.snapshot_date],
  );
  useAppChromeMeta(chromeMeta);

  if (overviewQuery.isPending) {
    return (
      <LoadingState
        title="개요 불러오는 중"
        description="최신 KPI와 월간 현금흐름, 최근 거래를 불러오고 있습니다."
      />
    );
  }

  if (overviewQuery.isError) {
    return (
      <ErrorState
        title="개요 데이터를 불러올 수 없습니다"
        description="개요 화면에 필요한 요약 데이터를 가져오지 못했습니다."
        detail={overviewQuery.error instanceof Error ? overviewQuery.error.message : undefined}
      />
    );
  }

  if (!overviewQuery.data) {
    return (
      <EmptyState
        title="표시할 개요 데이터가 없습니다"
        description="데이터를 업로드하면 월간 현금흐름과 최근 거래, 경고 신호를 여기서 보여줍니다."
      />
    );
  }

  const { category_top5, monthly_cashflow, recent_transactions, recent_upload_status, signal_summaries, summary_cards } =
    overviewQuery.data;
  const monthlyCashflowStart = monthly_cashflow[0]?.period ?? '기간 정보 없음';
  const monthlyCashflowEnd =
    monthly_cashflow[monthly_cashflow.length - 1]?.period ?? monthlyCashflowStart;
  const recentTransactionDates = recent_transactions.map((item) => item.date).sort();
  const recentTransactionsStart = recentTransactionDates[0] ?? '기간 정보 없음';
  const recentTransactionsEnd =
    recentTransactionDates[recentTransactionDates.length - 1] ?? recentTransactionsStart;

  return (
    <div className="space-y-5">
      <MetricCardGrid items={summary_cards} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.9fr)]">
        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <IconTitle
              description="월별 수입·지출과 순현금흐름을 함께 확인합니다."
              icon="presentationChartLine"
              title="월간 현금흐름"
            />
            <div className="flex flex-wrap items-center gap-2">
              <CardPeriodBadgeGroup
                ariaLabel="월간 현금흐름 적용 기간"
                end={monthlyCashflowEnd}
                start={monthlyCashflowStart}
              />
              {recent_upload_status ? (
                <Badge variant="secondary">최근 업로드 {recent_upload_status}</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full" aria-label="월간 현금흐름 차트">
              <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={320}>
                <ComposedChart
                  data={monthly_cashflow}
                  margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis axisLine={false} dataKey="period" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
                  <Tooltip
                    content={({ active, label, payload }) => {
                      if (!active || !payload || payload.length === 0) {
                        return null;
                      }

                      return (
                        <ChartTooltipContent
                          title={typeof label === 'string' ? label : undefined}
                          items={payload.map((entry) => ({
                            color: entry.color ?? CHART_ACCENT,
                            label: entry.name !== undefined ? String(entry.name) : '금액',
                            value: formatMoney(entry.value),
                          }))}
                        />
                      );
                    }}
                  />
                  <Bar
                    dataKey="income"
                    fill={CHART_ACCENT}
                    maxBarSize={28}
                    name="수입"
                    radius={CHART_BAR_RADIUS_VERTICAL}
                  />
                  <Bar
                    dataKey="expense"
                    fill={CHART_SECONDARY}
                    maxBarSize={28}
                    name="지출"
                    radius={CHART_BAR_RADIUS_VERTICAL}
                  />
                  <Line
                    dataKey="net_cashflow"
                    dot={false}
                    name="순현금흐름"
                    stroke={CHART_COMPLEMENTARY}
                    strokeWidth={3}
                    type="monotone"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <IconTitle icon="exclamationTriangle" title="주의 신호" />
          </CardHeader>
          <CardContent className="space-y-3">
            {signal_summaries.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'rounded-[var(--radius)] border p-3.5',
                  getCardGroupSurfaceClass(
                    item.label.includes('이상')
                      ? 'accent'
                      : item.label.includes('반복')
                        ? 'secondary'
                        : 'primary',
                  ),
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">{item.label}</p>
                  <Badge variant="accent">{item.value}</Badge>
                </div>
                <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.38fr)]">
        <Card>
          <CardHeader>
            <IconTitle icon="tag" title="카테고리 요약 Top 5" />
          </CardHeader>
          <CardContent className="space-y-2.5">
            {category_top5.map((item, index) => (
              <div
                key={item.category}
                className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={index === 0 ? 'default' : 'secondary'}>{index + 1}</Badge>
                    <p className="font-medium text-[color:var(--color-text)]">{item.category}</p>
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">{item.share.toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <IconTitle icon="clock" title="최근 거래" />
            <CardPeriodBadgeGroup
              ariaLabel="최근 거래 적용 기간"
              end={recentTransactionsEnd}
              start={recentTransactionsStart}
            />
          </CardHeader>
          <CardContent>
            <TransactionsTable rows={recent_transactions} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
