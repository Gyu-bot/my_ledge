import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { getCategoryBreakdown } from '../../api/dashboard';
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
        ? buildCategoryBreakdown(categoryQuery.data.items)
        : [];

  const hasData = chartData.length > 0;
  const periodLabel = formatActivePeriod(activePreset, activeStartMonth, activeEndMonth);

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
    <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)] xl:min-h-[25rem]">
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">
                카테고리 비중
              </h3>
              <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-amber-700">
                비중
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              선택한 월 범위 기준 주요 지출 카테고리 비중을 보여줍니다.
            </p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--color-text-subtle)]">
                선택 기간
              </p>
              <p className="mt-1 text-sm leading-5 text-[color:var(--color-text-muted)]">
                {periodLabel}
                {categoryQuery.isFetching ? ' · 갱신 중' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activePreset !== 'all' ? (
                <button
                  className="rounded-full border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--color-text-muted)] transition hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]"
                  onClick={() => handlePresetSelect('all')}
                  type="button"
                >
                  전체로 초기화
                </button>
              ) : null}
              <button
                aria-controls="category-range-panel"
                aria-expanded={isFilterOpen}
                className="rounded-full bg-[color:var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
                onClick={() => {
                  setValidationMessage(null);
                  setIsFilterOpen((current) => !current);
                }}
                type="button"
              >
                {isFilterOpen ? '기간 닫기' : '기간 변경'}
              </button>
            </div>
          </div>

          {isFilterOpen ? (
            <div
              className="mt-3 space-y-3 rounded-[1.25rem] border border-[color:var(--color-border)] bg-white px-3 py-3"
              id="category-range-panel"
            >
              <div className="flex flex-wrap gap-2">
                {presetOptions.map((option) => {
                  const isActive = activePreset === option.key;
                  return (
                    <button
                      key={option.key}
                      aria-pressed={isActive}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'bg-[color:var(--color-primary)] text-white shadow-[var(--shadow-soft)]'
                          : 'border border-[color:var(--color-border)] bg-white text-[color:var(--color-text-muted)] hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]'
                      }`}
                      onClick={() => handlePresetSelect(option.key)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                    시작 월
                  </span>
                  <input
                    className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
                    onChange={(event) => setDraftStartMonth(event.target.value)}
                    type="month"
                    value={draftStartMonth}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                    종료 월
                  </span>
                  <input
                    className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
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
                <button
                  className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  onClick={handleApplyCustomRange}
                  type="button"
                >
                  적용
                </button>
              </div>

              {validationMessage ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {validationMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 items-center">
          {categoryQuery.isError && activePreset !== 'all' ? (
            <div className="w-full rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-6 text-sm leading-6 text-rose-800">
              선택한 월 범위의 카테고리 데이터를 불러오지 못했습니다.
            </div>
          ) : hasData ? (
            <div className="w-full">
              <CategoryDonutChart data={chartData} />
            </div>
          ) : (
            <div className="w-full rounded-[1.5rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-10 text-center text-sm leading-6 text-[color:var(--color-text-muted)]">
              선택한 기간에 표시할 카테고리 지출 데이터가 없습니다.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
