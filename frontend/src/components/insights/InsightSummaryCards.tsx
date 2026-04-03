import type { SummaryCard } from '../../types/dashboard';
import { Card, CardContent } from '../ui/card';
import { getCardGroupSurfaceClass } from '../common/cardGroupSurface';
import { AssumptionPopover } from './AssumptionPopover';
import { cn } from '../../lib/utils';

interface InsightSummaryCardsProps {
  items: SummaryCard[];
  incomeStabilityAssumption?: string | null;
}

export function InsightSummaryCards({
  items,
  incomeStabilityAssumption = null,
}: InsightSummaryCardsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const toneClass = getCardGroupSurfaceClass(
          index === items.length - 1 ? 'accent' : 'primary',
        );

        const showIncomeAssumption =
          item.label === '수입 변동성' && incomeStabilityAssumption;

        return (
          <Card
            key={item.label}
            className={cn(
              'p-0',
              toneClass,
            )}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-[color:var(--color-text-muted)]">
                  {item.label}
                </p>
                {showIncomeAssumption ? (
                  <AssumptionPopover
                    ariaLabel="수입 안정성 가정 보기"
                    content={incomeStabilityAssumption}
                  />
                ) : null}
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--color-text)]">
                {item.value}
              </p>
              <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-muted)]">
                {item.detail}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
