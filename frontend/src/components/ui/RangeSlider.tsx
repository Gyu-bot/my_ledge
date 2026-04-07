import { useState } from 'react'

interface RangeSliderProps {
  months: string[]           // ["2025-01", "2025-02", ...]
  value: [string, string]    // [startMonth, endMonth]
  onChange: (range: [string, string]) => void
}

export function RangeSlider({ months, value, onChange }: RangeSliderProps) {
  const [draft, setDraft] = useState(value)
  const startIdx = months.indexOf(draft[0])
  const endIdx = months.indexOf(draft[1])
  const safeLen = Math.max(months.length - 1, 1)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-text-faint shrink-0">{months[0]}</span>
        <div className="relative flex-1 h-1 bg-border rounded">
          <div
            className="absolute h-full bg-accent/60 rounded"
            style={{
              left: `${(startIdx / safeLen) * 100}%`,
              right: `${100 - (endIdx / safeLen) * 100}%`,
            }}
          />
          <input
            type="range" min={0} max={months.length - 1} value={startIdx}
            onChange={(e) => {
              const i = Number(e.target.value)
              if (i <= endIdx) setDraft([months[i], draft[1]])
            }}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            style={{ zIndex: 2 }}
          />
          <input
            type="range" min={0} max={months.length - 1} value={endIdx}
            onChange={(e) => {
              const i = Number(e.target.value)
              if (i >= startIdx) setDraft([draft[0], months[i]])
            }}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            style={{ zIndex: 3 }}
          />
          <div className="absolute w-3 h-3 bg-accent rounded-full -translate-y-1/2 top-1/2 pointer-events-none"
            style={{ left: `calc(${(startIdx / safeLen) * 100}% - 6px)` }} />
          <div className="absolute w-3 h-3 bg-accent rounded-full -translate-y-1/2 top-1/2 pointer-events-none"
            style={{ left: `calc(${(endIdx / safeLen) * 100}% - 6px)` }} />
        </div>
        <span className="text-[10px] text-text-faint shrink-0">{months[months.length - 1]}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-accent">{draft[0]}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onChange(draft)}
            className="text-[10px] px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md"
          >
            적용
          </button>
          <button
            onClick={() => {
              const reset: [string, string] = [months[0], months[months.length - 1]]
              setDraft(reset)
              onChange(reset)
            }}
            className="text-[10px] px-3 py-1.5 border border-border-strong text-text-ghost rounded-md"
          >
            초기화
          </button>
        </div>
        <span className="text-[10px] text-accent">{draft[1]}</span>
      </div>
    </div>
  )
}
