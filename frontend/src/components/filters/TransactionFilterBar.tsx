import { DateRangeFilter } from './DateRangeFilter';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

export interface TransactionFilterValues {
  start_month: string;
  end_month: string;
  category_major: string;
  payment_method: string;
  search: string;
}

interface TransactionFilterBarProps {
  values: TransactionFilterValues;
  categoryOptions: string[];
  paymentMethodOptions: string[];
  onApply: (next: TransactionFilterValues) => void;
  onReset: () => void;
}

export function TransactionFilterBar({
  categoryOptions,
  onApply,
  onReset,
  paymentMethodOptions,
  values,
}: TransactionFilterBarProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <DateRangeFilter
            startMonth={values.start_month}
            endMonth={values.end_month}
            onStartMonthChange={(start_month) => onApply({ ...values, start_month })}
            onEndMonthChange={(end_month) => onApply({ ...values, end_month })}
          />
        </div>

        <label className="min-w-[11rem]">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            카테고리
          </span>
          <Select
            onValueChange={(value) =>
              onApply({ ...values, category_major: value === '__all__' ? '' : value })
            }
            value={values.category_major || '__all__'}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="min-w-[11rem]">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            결제수단
          </span>
          <Select
            onValueChange={(value) =>
              onApply({ ...values, payment_method: value === '__all__' ? '' : value })
            }
            value={values.payment_method || '__all__'}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체</SelectItem>
              {paymentMethodOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="min-w-[14rem] flex-1">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            검색
          </span>
          <Input
            className="mt-1.5"
            onChange={(event) => onApply({ ...values, search: event.target.value })}
            placeholder="거래 설명 검색"
            value={values.search}
          />
        </label>

          <Button className="h-[3.125rem]" onClick={onReset} type="button" variant="outline">
            초기화
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
