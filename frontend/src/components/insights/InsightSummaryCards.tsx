import type { SummaryCard } from '../../types/dashboard';
import { MetricCardGrid } from '../layout/MetricCardGrid';

interface InsightSummaryCardsProps {
  items: SummaryCard[];
}

export function InsightSummaryCards({ items }: InsightSummaryCardsProps) {
  return <MetricCardGrid items={items} />;
}
