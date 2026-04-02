import type { RecentTransaction } from '../../types/dashboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

interface TransactionsTableProps {
  rows: RecentTransaction[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCategoryMajorMinor(major: string, minor: string | null) {
  return minor ? `${major} / ${minor}` : major;
}

export function TransactionsTable({ rows }: TransactionsTableProps) {
  return (
    <div className="overflow-x-auto">
      <div className="hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/80 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[7.5rem] whitespace-nowrap">일자</TableHead>
              <TableHead className="w-[34%]">내역</TableHead>
              <TableHead className="w-[24%]">카테고리</TableHead>
              <TableHead className="w-[8.5rem] whitespace-nowrap">결제수단</TableHead>
              <TableHead className="w-[8rem] whitespace-nowrap text-right">금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-[color:var(--color-text-muted)]">
                {row.date ?? '-'}
              </TableCell>
              <TableCell className="font-medium text-[color:var(--color-text)]">
                {row.description}
              </TableCell>
              <TableCell className="text-[color:var(--color-text-muted)]">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-[color:var(--color-text)]">
                    {row.effective_category_major}
                  </span>
                  <span className="text-xs text-[color:var(--color-text-subtle)]">
                    {row.effective_category_minor ?? '-'}
                  </span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-[color:var(--color-text-muted)]">
                {row.payment_method ?? 'N/A'}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold text-[color:var(--color-text)]">
                {formatCurrency(row.amount)}
              </TableCell>
            </TableRow>
          ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <Card key={row.id} className="bg-white/80">
            <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[color:var(--color-text)]">
                  {row.description}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  {row.date ?? '-'}
                </p>
              </div>
              <p className="text-sm font-semibold text-[color:var(--color-text)]">
                {formatCurrency(row.amount)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--color-text-muted)]">
              <Badge className="normal-case tracking-normal">
                {formatCategoryMajorMinor(row.effective_category_major, row.effective_category_minor)}
              </Badge>
              <Badge className="normal-case tracking-normal" variant="accent">
                {row.payment_method ?? 'N/A'}
              </Badge>
            </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
