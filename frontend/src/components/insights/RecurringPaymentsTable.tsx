import type { RecurringPaymentItemResponse } from '../../types/analytics';
import { TableMobileCard } from '../common/TableMobileCard';
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
    <div className="min-w-0 w-full overflow-hidden rounded-[var(--radius)] bg-[color:var(--color-surface)] md:overflow-x-auto">
      <div className="hidden md:block">
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

      <div className="min-w-0 w-full space-y-3 md:hidden">
        {items.map((item) => (
          <TableMobileCard
            key={`${item.merchant}-${item.last_date}`}
            badges={[
              { label: item.category },
              { label: item.interval_type, variant: 'secondary' },
            ]}
            rows={[
              { label: '평균 금액', value: formatMoney(item.avg_amount) },
              { label: '발생 횟수', value: `${item.occurrences}회` },
            ]}
            subtitle={item.last_date ? `최근 ${item.last_date}` : undefined}
            title={item.merchant}
          />
        ))}
      </div>
    </div>
  );
}
