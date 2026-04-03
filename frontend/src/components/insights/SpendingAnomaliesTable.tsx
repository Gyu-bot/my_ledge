import type { SpendingAnomalyItemResponse } from '../../types/analytics';
import { TableMobileCard } from '../common/TableMobileCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface SpendingAnomaliesTableProps {
  items: SpendingAnomalyItemResponse[];
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

export function SpendingAnomaliesTable({ items }: SpendingAnomaliesTableProps) {
  return (
    <div className="min-w-0 w-full overflow-hidden rounded-[var(--radius)] bg-[color:var(--color-surface)] md:overflow-x-auto">
      <div className="hidden md:block">
        <Table density="compact">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>기간</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>기준 평균</TableHead>
              <TableHead>사유</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.period}-${item.category}`}>
                <TableCell>{item.period}</TableCell>
                <TableCell className="font-medium text-[color:var(--color-text)]">{item.category}</TableCell>
                <TableCell>{formatMoney(item.amount)}</TableCell>
                <TableCell>{formatMoney(item.baseline_avg)}</TableCell>
                <TableCell>{item.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="min-w-0 w-full space-y-3 md:hidden">
        {items.map((item) => (
          <TableMobileCard
            key={`${item.period}-${item.category}`}
            badges={[{ label: item.period, variant: 'reference' }]}
            rows={[
              { label: '기준 평균', value: formatMoney(item.baseline_avg) },
              { label: '사유', value: item.reason },
            ]}
            title={item.category}
            value={formatMoney(item.amount)}
          />
        ))}
      </div>
    </div>
  );
}
