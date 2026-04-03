import { useMemo } from 'react';
import { BreakdownPieChart } from '../components/charts/BreakdownPieChart';
import { CardPeriodBadgeGroup } from '../components/common/CardPeriodBadgeGroup';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { IconTitle } from '../components/common/IconTitle';
import { LineTrendChart } from '../components/charts/LineTrendChart';
import { LoadingState } from '../components/common/LoadingState';
import { SectionPlaceholder } from '../components/common/SectionPlaceholder';
import { StatusCard } from '../components/common/StatusCard';
import { getCardGroupSurfaceClass } from '../components/common/cardGroupSurface';
import { useAppChromeMeta } from '../components/layout/AppChromeContext';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { useAssets } from '../hooks/useAssets';
import { cn } from '../lib/utils';

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

const assetSummarySecondaryCardClass = cn(
  'rounded-[var(--radius)] border p-3.5',
  getCardGroupSurfaceClass('secondary'),
);

const assetSummaryPrimaryCardClass = cn(
  'rounded-[var(--radius)] border p-3.5',
  getCardGroupSurfaceClass('primary'),
);

export function AssetsPage() {
  const assetsQuery = useAssets();
  const chromeMeta = useMemo(
    () =>
      assetsQuery.data?.snapshot_date ? (
        <Badge variant="reference">기준일 {assetsQuery.data.snapshot_date}</Badge>
      ) : null,
    [assetsQuery.data?.snapshot_date],
  );
  useAppChromeMeta(chromeMeta);

  if (assetsQuery.isPending) {
    return (
      <LoadingState
        title="자산 화면 불러오는 중"
        description="순자산 추이와 투자·대출 요약을 가져오고 있습니다."
      />
    );
  }

  if (assetsQuery.isError) {
    return (
      <ErrorState
        title="자산 데이터를 불러올 수 없습니다"
        description="자산 시계열 또는 투자·대출 요약을 가져오지 못했습니다."
        detail={assetsQuery.error instanceof Error ? assetsQuery.error.message : undefined}
      />
    );
  }

  if (!assetsQuery.data) {
    return (
      <EmptyState
        title="표시할 자산 데이터가 없습니다"
        description="재무현황 스냅샷이 적재되면 자산 현황 페이지를 표시합니다."
      />
    );
  }

  const { investments, loans, net_worth_history, snapshot_date, summary_cards } =
    assetsQuery.data;
  const netWorthStartPeriod = net_worth_history[0]?.period ?? snapshot_date ?? '기준일 없음';
  const netWorthEndPeriod =
    net_worth_history[net_worth_history.length - 1]?.period ?? snapshot_date ?? '기준일 없음';

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary_cards.map((card, index) => (
          <StatusCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            tone={index === summary_cards.length - 1 ? 'accent' : 'primary'}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <IconTitle
              description="적재된 스냅샷 기준 순자산 변화를 시계열로 보여줍니다."
              icon="presentationChartLine"
              title="순자산 추이"
            />
            <CardPeriodBadgeGroup
              ariaLabel="순자산 추이 적용 기간"
              end={netWorthEndPeriod}
              start={netWorthStartPeriod}
            />
          </CardHeader>
          <CardContent>
            {net_worth_history.length > 0 ? (
              <LineTrendChart data={net_worth_history} />
            ) : (
              <SectionPlaceholder
                title="순자산 추이 데이터 없음"
                description="재무현황 스냅샷이 적재되면 이 영역에 순자산 변화를 그립니다."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <IconTitle
              description="최신 투자 스냅샷 기준 평가액과 주요 포지션입니다."
              icon="banknotes"
              title="투자 요약"
            />
            <CardPeriodBadgeGroup
              ariaLabel="투자 요약 기준일"
              start={investments.snapshot_date ?? '기준일 없음'}
            />
          </CardHeader>
          <CardContent>
            {investments.items.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={assetSummarySecondaryCardClass}>
                    <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                      총 투자원금
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                      {formatMoney(investments.totals.cost_basis)}
                    </p>
                  </div>
                  <div className={assetSummaryPrimaryCardClass}>
                    <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                      총 평가액
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                      {formatMoney(investments.totals.market_value)}
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <BreakdownPieChart
                    ariaLabel="투자 항목 비중 파이 차트"
                    data={investments.allocation_breakdown}
                    emptyTitle="투자 비중 데이터 없음"
                    emptyDescription="평가액이 있는 투자 항목이 적재되면 이 영역에 비중 차트가 표시됩니다."
                  />
                </div>
              </>
            ) : (
              <SectionPlaceholder
                title="투자 스냅샷 없음"
                description="새 엑셀 업로드 후 이 영역에 주요 포지션과 평가액이 표시됩니다."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <IconTitle
              description="최신 대출 스냅샷 기준 잔액과 주요 대출 정보를 보여줍니다."
              icon="buildingLibrary"
              title="대출 요약"
            />
            <CardPeriodBadgeGroup
              ariaLabel="대출 요약 기준일"
              start={loans.snapshot_date ?? '기준일 없음'}
            />
          </CardHeader>
          <CardContent>
            {loans.items.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={assetSummarySecondaryCardClass}>
                    <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                      총 대출원금
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                      {formatMoney(loans.totals.principal)}
                    </p>
                  </div>
                  <div className={assetSummaryPrimaryCardClass}>
                    <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                      총 잔액
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                      {formatMoney(loans.totals.balance)}
                    </p>
                  </div>
                </div>
                <ul className="mt-5 space-y-3">
                  {loans.items.slice(0, 4).map((item) => (
                    <li
                      key={`${item.lender}-${item.product_name}`}
                      className={cn(
                        'rounded-[var(--radius)] border p-3.5',
                        getCardGroupSurfaceClass('secondary'),
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[color:var(--color-text)]">
                            {item.product_name}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                            {item.lender}
                            {item.loan_type ? ` · ${item.loan_type}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[color:var(--color-text)]">
                            {formatMoney(item.balance ?? 0)}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                            {item.interest_rate === null ? '금리 없음' : `${item.interest_rate.toFixed(2)}%`}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <SectionPlaceholder
                title="대출 스냅샷 없음"
                description="대출 데이터가 적재되면 이 영역에 잔액과 금리 정보가 표시됩니다."
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
