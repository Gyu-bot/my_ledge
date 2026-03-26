import { LineTrendChart } from '../components/charts/LineTrendChart';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { SectionPlaceholder } from '../components/common/SectionPlaceholder';
import { StatusCard } from '../components/common/StatusCard';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAssets } from '../hooks/useAssets';

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return '수익률 없음';
  }

  return `${value.toFixed(2)}%`;
}

export function AssetsPage() {
  const assetsQuery = useAssets();

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="자산"
        title="자산 현황"
        description="순자산 추이와 투자·대출 요약을 한 화면에서 확인합니다."
        meta={snapshot_date ? `기준일 ${snapshot_date}` : undefined}
      />

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

      <section className="grid gap-6 xl:items-start xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,1fr)]">
        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>순자산 추이</CardTitle>
              <CardDescription className="mt-2">
                적재된 스냅샷 기준 순자산 변화를 시계열로 보여줍니다.
              </CardDescription>
            </div>
            <Badge>순자산</Badge>
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

        <div className="grid gap-6">
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div>
                <CardTitle>투자 요약</CardTitle>
                <CardDescription className="mt-2">
                  최신 투자 스냅샷 기준 평가액과 주요 포지션입니다.
                </CardDescription>
              </div>
              <Badge variant="accent">{investments.snapshot_date ?? '기준일 없음'}</Badge>
            </CardHeader>
            <CardContent>
              {investments.items.length > 0 ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4">
                      <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                        총 투자원금
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                        {formatMoney(investments.totals.cost_basis)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4">
                      <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                        총 평가액
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                        {formatMoney(investments.totals.market_value)}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-5 space-y-3">
                    {investments.items.slice(0, 4).map((item) => (
                      <li
                        key={`${item.broker}-${item.product_name}`}
                        className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[color:var(--color-text)]">
                              {item.product_name}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                              {item.broker}
                              {item.product_type ? ` · ${item.product_type}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-[color:var(--color-text)]">
                              {formatMoney(item.market_value ?? 0)}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                              {formatPercent(item.return_rate)}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
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
              <div>
                <CardTitle>대출 요약</CardTitle>
                <CardDescription className="mt-2">
                  최신 대출 스냅샷 기준 잔액과 주요 대출 정보를 보여줍니다.
                </CardDescription>
              </div>
              <Badge variant="destructive">{loans.snapshot_date ?? '기준일 없음'}</Badge>
            </CardHeader>
            <CardContent>
              {loans.items.length > 0 ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4">
                      <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                        총 대출원금
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                        {formatMoney(loans.totals.principal)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4">
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
                        className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4"
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
        </div>
      </section>
    </div>
  );
}
