import type { SpendingAnomalyItemResponse } from '../../types/analytics';
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
    <div className="overflow-x-auto rounded-[var(--radius)] bg-[color:var(--color-surface)]">
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
  );
}
