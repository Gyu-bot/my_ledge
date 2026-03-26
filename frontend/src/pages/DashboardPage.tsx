import { CategoryBreakdownCard } from '../components/dashboard/CategoryBreakdownCard';
import { LineTrendChart } from '../components/charts/LineTrendChart';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { StatusCard } from '../components/common/StatusCard';
import { PageHeader } from '../components/layout/PageHeader';
import { TransactionsTable } from '../components/tables/TransactionsTable';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useDashboard } from '../hooks/useDashboard';

export function DashboardPage() {
  const dashboardQuery = useDashboard();

  if (dashboardQuery.isPending) {
    return (
      <LoadingState
        title="대시보드 불러오는 중"
        description="최신 재무 스냅샷과 지출 추이, 최근 거래 데이터를 가져오고 있습니다."
      />
    );
  }

  if (dashboardQuery.isError) {
    return (
      <ErrorState
        title="대시보드 데이터를 불러올 수 없습니다"
        description="이 화면에 필요한 요약 데이터와 거래 집계를 가져오지 못했습니다."
        detail={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : undefined}
      />
    );
  }

  if (!dashboardQuery.data) {
    return (
      <EmptyState
        title="표시할 대시보드 데이터가 없습니다"
        description="엑셀 파일을 업로드하거나 거래를 추가하면 자산, 추이, 카테고리 요약을 표시합니다."
      />
    );
  }

  const { category_breakdown, monthly_spend, recent_transactions, snapshot_date, summary_cards } =
    dashboardQuery.data;
  const categoryReferenceMonth =
    monthly_spend[monthly_spend.length - 1]?.period ?? recent_transactions[0]?.date.slice(0, 7) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        description="최신 순자산, 월별 지출 흐름, 카테고리 비중, 최근 거래를 한 화면에서 빠르게 확인합니다."
        eyebrow="개요"
        meta={snapshot_date ? `기준일 ${snapshot_date}` : undefined}
        title="대시보드"
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary_cards.map((card, index) => (
          <StatusCard
            key={card.label}
            detail={card.detail}
            label={card.label}
            tone={index === summary_cards.length - 1 ? 'accent' : 'primary'}
            value={card.value}
          />
        ))}
      </section>

      <section className="grid gap-6 xl:items-start xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.95fr)]">
        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>월별 지출 추이</CardTitle>
              <CardDescription className="mt-2">
                canonical 거래 요약을 기준으로 월별 지출 흐름을 정리했습니다.
              </CardDescription>
            </div>
            <Badge>지출</Badge>
          </CardHeader>
          <CardContent>
            <LineTrendChart data={monthly_spend} />
          </CardContent>
        </Card>

        <CategoryBreakdownCard
          data={category_breakdown}
          referenceMonth={categoryReferenceMonth}
        />
      </section>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>최근 거래</CardTitle>
            <CardDescription className="mt-2">
              canonical read model 기준 최신 거래를 보여줍니다.
            </CardDescription>
          </div>
          <p className="text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            최근 {recent_transactions.length}건
          </p>
        </CardHeader>
        <CardContent>
          <TransactionsTable rows={recent_transactions} />
        </CardContent>
      </Card>
    </div>
  );
}
