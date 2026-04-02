import type { SummaryCard } from '../../types/dashboard';
import { StatusCard } from '../common/StatusCard';

interface MetricCardGridProps {
  items: SummaryCard[];
}

export function MetricCardGrid({ items }: MetricCardGridProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <StatusCard
          key={item.label}
          detail={item.detail}
          label={item.label}
          tone={index === items.length - 1 ? 'accent' : 'primary'}
          value={item.value}
        />
      ))}
    </section>
  );
}
