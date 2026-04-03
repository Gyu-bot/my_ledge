import type { SpendingBreakdownDatum } from '../../hooks/useSpending';
import { SectionPlaceholder } from '../common/SectionPlaceholder';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

interface CategoryBreakdownTableProps {
  rows: SpendingBreakdownDatum[];
  title: string;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShare(share: number) {
  return `${share.toFixed(1)}%`;
}

export function CategoryBreakdownTable({ rows, title }: CategoryBreakdownTableProps) {
  if (rows.length === 0) {
    return (
      <SectionPlaceholder
        title={`${title} 데이터 없음`}
        description={`선택한 기간에 표시할 ${title} 데이터를 찾지 못했습니다.`}
      />
    );
  }

  return (
    <Card className="bg-white/75">
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-base">{title} 표</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            비중과 금액을 함께 확인합니다.
          </p>
        </div>
        <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          {rows.length}개
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-[var(--radius)]">
          <Table density="compact">
            <TableHeader className="bg-[color:var(--color-secondary-soft)]/72">
              <TableRow className="hover:bg-transparent">
                <TableHead>카테고리</TableHead>
                <TableHead className="text-right">비중</TableHead>
                <TableHead className="text-right">금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.label}
              >
                <TableCell className="font-medium text-[color:var(--color-text)]">{row.label}</TableCell>
                <TableCell className="text-right text-[color:var(--color-text-muted)]">
                  {formatShare(row.share)}
                </TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
              </TableRow>
            ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
