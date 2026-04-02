import type { RecurringPaymentItemResponse } from '../../types/analytics';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface RecurringPaymentsTableProps {
  items: RecurringPaymentItemResponse[];
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

export function RecurringPaymentsTable({ items }: RecurringPaymentsTableProps) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>거래처</TableHead>
            <TableHead>카테고리</TableHead>
            <TableHead>평균 금액</TableHead>
            <TableHead>간격</TableHead>
            <TableHead>발생 횟수</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.merchant}-${item.last_date}`}>
              <TableCell className="font-medium text-[color:var(--color-text)]">{item.merchant}</TableCell>
              <TableCell>{item.category}</TableCell>
              <TableCell>{formatMoney(item.avg_amount)}</TableCell>
              <TableCell>{item.interval_type}</TableCell>
              <TableCell>{item.occurrences}회</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
