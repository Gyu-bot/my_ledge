export interface TimelineRangeFilterValues {
  start_month: string;
  end_month: string;
}

interface TimelineRangeSliderProps {
  months: string[];
  values: TimelineRangeFilterValues;
  onChange: (next: TimelineRangeFilterValues) => void;
  onReset: () => void;
}

function resolveSelectedIndex(months: string[], month: string, fallback: number) {
  if (!month) {
    return fallback;
  }

  const index = months.indexOf(month);
  return index >= 0 ? index : fallback;
}

function buildSelectedTrackStyle(
  startIndex: number,
  endIndex: number,
  maxIndex: number,
): { left: string; width: string } {
  if (maxIndex <= 0) {
    return {
      left: '0%',
      width: '100%',
    };
  }

  const left = (startIndex / maxIndex) * 100;
  const right = (endIndex / maxIndex) * 100;

  return {
    left: `${left}%`,
    width: `${Math.max(right - left, 0)}%`,
  };
}

export function TimelineRangeSlider({
  months,
  onChange,
  onReset,
  values,
}: TimelineRangeSliderProps) {
  if (months.length === 0) {
    return null;
  }

  const maxIndex = months.length - 1;
  const startIndex = resolveSelectedIndex(months, values.start_month, 0);
  const endIndex = resolveSelectedIndex(months, values.end_month, maxIndex);
  const normalizedStartIndex = Math.min(startIndex, endIndex);
  const normalizedEndIndex = Math.max(startIndex, endIndex);
  const trackStyle = buildSelectedTrackStyle(normalizedStartIndex, normalizedEndIndex, maxIndex);

  const applyIndexes = (nextStartIndex: number, nextEndIndex: number) => {
    const safeStart = Math.min(nextStartIndex, nextEndIndex);
    const safeEnd = Math.max(nextStartIndex, nextEndIndex);

    onChange({
      start_month: months[safeStart],
      end_month: months[safeEnd],
    });
  };

  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-white/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            시계열 기간
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-[color:var(--color-primary)]">
              {months[normalizedStartIndex]}
            </span>
            <span className="text-sm text-[color:var(--color-text-muted)]">~</span>
            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
              {months[normalizedEndIndex]}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white px-4 py-2 text-xs font-semibold text-[color:var(--color-text-muted)] transition hover:border-blue-200 hover:bg-blue-50"
        >
          전체 기간
        </button>
      </div>

      <div className="mt-5 rounded-[1.25rem] border border-[color:rgba(148,163,184,0.18)] bg-slate-50/80 px-4 py-4">
        <div className="relative h-10">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200" />
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-600 to-amber-400"
            style={trackStyle}
          />
          <input
            aria-label="시작 월 슬라이더"
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={normalizedStartIndex}
            onChange={(event) => applyIndexes(Number(event.target.value), normalizedEndIndex)}
            className="pointer-events-none absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[color:var(--color-primary)] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[color:var(--color-primary)] [&::-webkit-slider-thumb]:shadow-[0_8px_18px_-10px_rgba(30,64,175,0.8)]"
            style={{ zIndex: 2 }}
          />
          <input
            aria-label="종료 월 슬라이더"
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={normalizedEndIndex}
            onChange={(event) => applyIndexes(normalizedStartIndex, Number(event.target.value))}
            className="pointer-events-none absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-[0_8px_18px_-10px_rgba(245,158,11,0.85)]"
            style={{ zIndex: 3 }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs font-medium text-[color:var(--color-text-muted)]">
          <span>{months[0]}</span>
          <span>{months[maxIndex]}</span>
        </div>
      </div>
    </div>
  );
}
