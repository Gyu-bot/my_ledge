import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { getCategoryBreakdown } from '../../api/dashboard';
import { CardPeriodBadgeGroup } from '../common/CardPeriodBadgeGroup';
import { ensureArray } from '../../lib/collections';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { CategoryDonutChart } from '../charts/CategoryDonutChart';
import type { CategoryBreakdownSlice } from '../../types/dashboard';

type CategoryRangePreset = 'all' | 'last3' | 'last6' | 'last12' | 'custom';

interface CategoryBreakdownCardProps {
  data: CategoryBreakdownSlice[];
  referenceMonth: string | null;
}

const presetOptions: Array<{ key: Exclude<CategoryRangePreset, 'custom'>; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'last3', label: '최근 3개월' },
  { key: 'last6', label: '최근 6개월' },
  { key: 'last12', label: '최근 12개월' },
];

function parseMonthValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function shiftMonth(value: string, diff: number) {
  const parsed = parseMonthValue(value);

  if (!parsed) {
    return value;
  }

  const date = new Date(parsed.year, parsed.month - 1 + diff, 1);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function getMonthEndDate(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function toDateRange(startMonth: string, endMonth: string) {
  const start = parseMonthValue(startMonth);
  const end = parseMonthValue(endMonth);

  if (!start || !end) {
    return null;
  }

  const endDay = getMonthEndDate(end.year, end.month);

  return {
    start_date: `${start.year}-${`${start.month}`.padStart(2, '0')}-01`,
    end_date: `${end.year}-${`${end.month}`.padStart(2, '0')}-${`${endDay}`.padStart(2, '0')}`,
  };
}

function formatMonthLabel(value: string) {
  const parsed = parseMonthValue(value);

  if (!parsed) {
    return value;
  }

  return `${parsed.year}년 ${parsed.month}월`;
}

function getReferenceMonth(referenceMonth: string | null) {
  if (referenceMonth && parseMonthValue(referenceMonth)) {
    return referenceMonth;
  }

  const today = new Date();
  return `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}`;
}

function getPresetMonthRange(
  preset: Exclude<CategoryRangePreset, 'all' | 'custom'>,
  referenceMonth: string,
) {
  const months = preset === 'last3' ? 3 : preset === 'last6' ? 6 : 12;
  return {
    startMonth: shiftMonth(referenceMonth, -(months - 1)),
    endMonth: referenceMonth,
  };
}

function buildCategoryBreakdown(items: Array<{ category: string; amount: number }>) {
  const normalized = [...items]
    .map((item) => ({
      category: item.category,
      amount: Math.abs(item.amount),
    }))
    .sort((left, right) => right.amount - left.amount);
  const total = normalized.reduce((sum, item) => sum + item.amount, 0);

  return normalized.map((item) => ({
    ...item,
    share: total > 0 ? (item.amount / total) * 100 : 0,
  }));
}

function formatActivePeriod(
  preset: CategoryRangePreset,
  startMonth: string,
  endMonth: string,
) {
  if (preset === 'all') {
    return '조회 기간 전체';
  }

  return `조회 기간 ${formatMonthLabel(startMonth)} ~ ${formatMonthLabel(endMonth)}`;
}

export function CategoryBreakdownCard({ data, referenceMonth }: CategoryBreakdownCardProps) {
  const resolvedReferenceMonth = useMemo(
    () => getReferenceMonth(referenceMonth),
    [referenceMonth],
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<CategoryRangePreset>('all');
  const [activeStartMonth, setActiveStartMonth] = useState('');
  const [activeEndMonth, setActiveEndMonth] = useState('');
  const [draftStartMonth, setDraftStartMonth] = useState('');
  const [draftEndMonth, setDraftEndMonth] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const activeRange =
    activePreset === 'all' ? null : toDateRange(activeStartMonth, activeEndMonth);

  const categoryQuery = useQuery({
    queryKey: ['dashboard', 'category-breakdown', activeRange?.start_date, activeRange?.end_date],
    queryFn: () => {
      if (!activeRange) {
        throw new Error('활성화된 월 범위가 없습니다.');
      }

      return getCategoryBreakdown(activeRange);
    },
    enabled: activeRange !== null,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });

  const chartData =
    activePreset === 'all'
      ? data
      : categoryQuery.data
        ? buildCategoryBreakdown(ensureArray(categoryQuery.data.items))
        : [];

  const hasData = chartData.length > 0;
  const periodLabel = formatActivePeriod(activePreset, activeStartMonth, activeEndMonth);
  const activePeriodStart =
    activePreset === 'all' ? periodLabel : activeStartMonth || '기간 정보 없음';
  const activePeriodEnd = activePreset === 'all' ? undefined : activeEndMonth || activePeriodStart;

  function handlePresetSelect(preset: Exclude<CategoryRangePreset, 'custom'>) {
    setValidationMessage(null);

    if (preset === 'all') {
      setActivePreset('all');
      setActiveStartMonth('');
      setActiveEndMonth('');
      setDraftStartMonth('');
      setDraftEndMonth('');
      setIsFilterOpen(false);
      return;
    }

    const range = getPresetMonthRange(preset, resolvedReferenceMonth);
    setActivePreset(preset);
    setActiveStartMonth(range.startMonth);
    setActiveEndMonth(range.endMonth);
    setDraftStartMonth(range.startMonth);
    setDraftEndMonth(range.endMonth);
    setIsFilterOpen(false);
  }

  function handleApplyCustomRange() {
    if (!draftStartMonth || !draftEndMonth) {
      setValidationMessage('시작 월과 종료 월을 모두 선택해 주세요.');
      return;
    }

    if (draftStartMonth > draftEndMonth) {
      setValidationMessage('시작 월은 종료 월보다 늦을 수 없습니다.');
      return;
    }

    setValidationMessage(null);
    setActivePreset('custom');
    setActiveStartMonth(draftStartMonth);
    setActiveEndMonth(draftEndMonth);
    setIsFilterOpen(false);
  }

  return (
    <Card className="xl:min-h-[25rem]">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <CardTitle>카테고리 비중</CardTitle>
              <Badge variant="accent">비중</Badge>
            </div>
            <CardDescription className="mt-2">
              선택한 월 범위 기준 주요 지출 카테고리 비중을 보여줍니다.
            </CardDescription>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--color-text-subtle)]">
                선택 기간
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <CardPeriodBadgeGroup
                  ariaLabel="카테고리 비중 적용 기간"
                  end={activePeriodEnd}
                  start={activePeriodStart}
                />
                {categoryQuery.isFetching ? (
                  <span className="text-sm leading-5 text-[color:var(--color-text-muted)]">
                    갱신 중
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {activePreset !== 'all' ? (
                <Button onClick={() => handlePresetSelect('all')} type="button" variant="outline">
                  전체로 초기화
                </Button>
              ) : null}
              <Button
                aria-controls="category-range-panel"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setValidationMessage(null);
                  setIsFilterOpen((current) => !current);
                }}
                type="button"
              >
                {isFilterOpen ? '기간 닫기' : '기간 변경'}
              </Button>
            </div>
          </div>

          {isFilterOpen ? (
            <div
              className="mt-3 space-y-3 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-3"
              id="category-range-panel"
            >
              <div className="flex flex-wrap gap-2">
                {presetOptions.map((option) => {
                  const isActive = activePreset === option.key;
                  return (
                    <Button
                      key={option.key}
                      aria-pressed={isActive}
                      onClick={() => handlePresetSelect(option.key)}
                      type="button"
                      variant={isActive ? 'default' : 'outline'}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                    시작 월
                  </span>
                  <Input
                    className="mt-1.5"
                    onChange={(event) => setDraftStartMonth(event.target.value)}
                    type="month"
                    value={draftStartMonth}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                    종료 월
                  </span>
                  <Input
                    className="mt-1.5"
                    onChange={(event) => setDraftEndMonth(event.target.value)}
                    type="month"
                    value={draftEndMonth}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-5 text-[color:var(--color-text-muted)]">
                  월 단위로만 선택하며, 선택한 월의 1일부터 말일까지 자동 집계합니다.
                </p>
                <Button onClick={handleApplyCustomRange} type="button">
                  적용
                </Button>
              </div>

              {validationMessage ? (
                <p className="rounded-[var(--radius-sm)] border border-[color:var(--color-warning-soft)] bg-[color:var(--color-warning-soft)] px-4 py-3 text-sm text-[color:var(--color-warning)]">
                  {validationMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 items-center">
        {categoryQuery.isError && activePreset !== 'all' ? (
          <div className="w-full rounded-[var(--radius)] border border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)] px-4 py-6 text-sm leading-6 text-[color:var(--color-danger)]">
            선택한 월 범위의 카테고리 데이터를 불러오지 못했습니다.
          </div>
        ) : hasData ? (
          <div className="w-full">
            <CategoryDonutChart data={chartData} />
          </div>
        ) : (
          <div className="w-full rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-10 text-center text-sm leading-6 text-[color:var(--color-text-muted)]">
            선택한 기간에 표시할 카테고리 지출 데이터가 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
