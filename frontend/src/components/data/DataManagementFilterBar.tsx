import { Card, CardContent } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export interface DataManagementFilterValues {
  search: string;
  category_major: string;
  payment_method: string;
  include_deleted: boolean;
}

interface DataManagementFilterBarProps {
  values: DataManagementFilterValues;
  categoryOptions: string[];
  paymentMethodOptions: string[];
  onApply: (next: DataManagementFilterValues) => void;
  onReset: () => void;
}

export function DataManagementFilterBar({
  values,
  categoryOptions,
  paymentMethodOptions,
  onApply,
  onReset,
}: DataManagementFilterBarProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.8fr))_auto]">
        <label className="space-y-2">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            검색
          </span>
          <Input
            type="search"
            value={values.search}
            onChange={(event) => onApply({ ...values, search: event.target.value })}
            placeholder="거래 설명 또는 메모 검색"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            대분류
          </span>
          <Select
            onValueChange={(value) =>
              onApply({ ...values, category_major: value === '__all__' ? '' : value })
            }
            value={values.category_major || '__all__'}
          >
            <SelectTrigger>
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

        <label className="space-y-2">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            결제수단
          </span>
          <Select
            onValueChange={(value) =>
              onApply({ ...values, payment_method: value === '__all__' ? '' : value })
            }
            value={values.payment_method || '__all__'}
          >
            <SelectTrigger>
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

        <label className="flex items-end">
          <span className="flex h-11 w-full items-center gap-3 rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)]">
            <Checkbox
              checked={values.include_deleted}
              onCheckedChange={(checked) =>
                onApply({ ...values, include_deleted: checked === true })
              }
            />
            삭제된 거래 포함
          </span>
        </label>

        <div className="flex items-end">
          <Button className="w-full" onClick={onReset} type="button" variant="outline">
            필터 초기화
          </Button>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
