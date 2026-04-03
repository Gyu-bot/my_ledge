import { useEffect, useMemo, useState } from 'react';
import { DateRangeFilter } from './DateRangeFilter';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

export interface TransactionFilterValues {
  start_month: string;
  end_month: string;
}

interface TransactionFilterBarProps {
  values: TransactionFilterValues;
  onApply: (next: TransactionFilterValues) => void;
  onReset: () => void;
  monthOptions?: string[];
}

function areFiltersEqual(left: TransactionFilterValues, right: TransactionFilterValues) {
  return left.start_month === right.start_month && left.end_month === right.end_month;
}

export function TransactionFilterBar({
  monthOptions,
  onApply,
  onReset,
  values,
}: TransactionFilterBarProps) {
  const [draftValues, setDraftValues] = useState<TransactionFilterValues>(values);

  useEffect(() => {
    setDraftValues(values);
  }, [values]);

  const hasPendingChanges = useMemo(
    () => !areFiltersEqual(draftValues, values),
    [draftValues, values],
  );

  return (
    <Card>
      <CardContent className="p-5">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(draftValues);
          }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <DateRangeFilter
                monthOptions={monthOptions}
                startMonth={draftValues.start_month}
                endMonth={draftValues.end_month}
                onStartMonthChange={(start_month) =>
                  setDraftValues((previous) => ({ ...previous, start_month }))
                }
                onEndMonthChange={(end_month) =>
                  setDraftValues((previous) => ({ ...previous, end_month }))
                }
              />
            </div>

            <div className="flex gap-2 lg:min-w-[16rem]">
              <Button className="flex-1" disabled={!hasPendingChanges} type="submit">
                적용
              </Button>
              <Button className="flex-1" onClick={onReset} type="button" variant="outline">
                초기화
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
