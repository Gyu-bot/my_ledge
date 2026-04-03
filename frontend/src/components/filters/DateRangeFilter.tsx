import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface DateRangeFilterProps {
  startMonth: string;
  endMonth: string;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  monthOptions?: string[];
}

export function DateRangeFilter({
  endMonth,
  monthOptions = [],
  onEndMonthChange,
  onStartMonthChange,
  startMonth,
}: DateRangeFilterProps) {
  const usesSelect = monthOptions.length > 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="block min-w-0">
        <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          시작 월
        </span>
        {usesSelect ? (
          <Select onValueChange={onStartMonthChange} value={startMonth || '__empty__'}>
            <SelectTrigger aria-label="시작 월" className="mt-1.5 min-w-0">
              <SelectValue placeholder="시작 월 선택" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((month) => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="mt-1.5 min-w-0"
            onChange={(event) => onStartMonthChange(event.target.value)}
            type="month"
            value={startMonth}
          />
        )}
      </label>

      <label className="block min-w-0">
        <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          종료 월
        </span>
        {usesSelect ? (
          <Select onValueChange={onEndMonthChange} value={endMonth || '__empty__'}>
            <SelectTrigger aria-label="종료 월" className="mt-1.5 min-w-0">
              <SelectValue placeholder="종료 월 선택" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((month) => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="mt-1.5 min-w-0"
            onChange={(event) => onEndMonthChange(event.target.value)}
            type="month"
            value={endMonth}
          />
        )}
      </label>
    </div>
  );
}
