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
  transaction_type: string;
  source: string;
  category_major: string;
  payment_method: string;
  date_from: string;
  date_to: string;
  edited_only: boolean;
  include_deleted: boolean;
}

interface DataManagementFilterBarProps {
  values: DataManagementFilterValues;
  categoryOptions: string[];
  paymentMethodOptions: string[];
  onChange: (next: DataManagementFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
  hasPendingChanges?: boolean;
}

export function DataManagementFilterBar({
  values,
  categoryOptions,
  paymentMethodOptions,
  onChange,
  onApply,
  onReset,
  hasPendingChanges = false,
}: DataManagementFilterBarProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.82fr))]">
          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              검색
            </span>
            <Input
              type="search"
              value={values.search}
              onChange={(event) => onChange({ ...values, search: event.target.value })}
              placeholder="거래 설명 또는 메모 검색"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              거래 유형
            </span>
            <Select
              onValueChange={(value) =>
                onChange({ ...values, transaction_type: value === '__all__' ? '' : value })
              }
              value={values.transaction_type || '__all__'}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                <SelectItem value="지출">지출</SelectItem>
                <SelectItem value="수입">수입</SelectItem>
                <SelectItem value="이체">이체</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              입력 출처
            </span>
            <Select
              onValueChange={(value) =>
                onChange({ ...values, source: value === '__all__' ? '' : value })
              }
              value={values.source || '__all__'}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                <SelectItem value="import">업로드</SelectItem>
                <SelectItem value="manual">수동 입력</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              대분류
            </span>
            <Select
              onValueChange={(value) =>
                onChange({ ...values, category_major: value === '__all__' ? '' : value })
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
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(9.5rem,10.5rem)_minmax(9.5rem,10.5rem)_auto_auto_auto] xl:items-end">
          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              결제수단
            </span>
            <Select
              onValueChange={(value) =>
                onChange({ ...values, payment_method: value === '__all__' ? '' : value })
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

          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              시작일
            </span>
            <Input
              className="max-w-[10.5rem]"
              type="date"
              value={values.date_from}
              onChange={(event) => onChange({ ...values, date_from: event.target.value })}
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              종료일
            </span>
            <Input
              className="max-w-[10.5rem]"
              type="date"
              value={values.date_to}
              onChange={(event) => onChange({ ...values, date_to: event.target.value })}
            />
          </label>

          <label className="flex items-end">
            <span className="js-filter-checkbox-row flex h-11 items-center gap-3 whitespace-nowrap rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)]">
              <Checkbox
                checked={values.include_deleted}
                onCheckedChange={(checked) =>
                  onChange({ ...values, include_deleted: checked === true })
                }
              />
              삭제된 거래 포함
            </span>
          </label>

          <label className="flex items-end">
            <span className="js-filter-checkbox-row flex h-11 items-center gap-3 whitespace-nowrap rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)]">
              <Checkbox
                checked={values.edited_only}
                onCheckedChange={(checked) =>
                  onChange({ ...values, edited_only: checked === true })
                }
              />
              사용자 수정만
            </span>
          </label>

          <div className="flex items-end">
            <div className="flex w-full gap-2">
              <Button className="flex-1" disabled={!hasPendingChanges} type="submit">
                필터 적용
              </Button>
              <Button className="flex-1" onClick={onReset} type="button" variant="outline">
                필터 초기화
              </Button>
            </div>
          </div>
        </div>
        </form>
      </CardContent>
    </Card>
  );
}
