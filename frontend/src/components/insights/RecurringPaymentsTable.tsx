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
    <div className="overflow-x-auto rounded-[var(--radius)] bg-[color:var(--color-surface)]">
      <Table className="table-fixed" density="compact">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[32%]">거래처</TableHead>
            <TableHead className="w-[20%]">카테고리</TableHead>
            <TableHead className="w-[16%]">평균 금액</TableHead>
            <TableHead className="w-[16%]">간격</TableHead>
            <TableHead className="w-[16%]">발생 횟수</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.merchant}-${item.last_date}`}>
              <TableCell className="max-w-0 font-medium text-[color:var(--color-text)]">
                <span className="block truncate" title={item.merchant}>
                  {item.merchant}
                </span>
              </TableCell>
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
