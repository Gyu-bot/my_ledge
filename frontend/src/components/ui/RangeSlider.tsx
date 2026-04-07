interface RangeSliderProps {
  min: number
  max: number
  value: [number, number]
  onChange: (value: [number, number]) => void
  labels?: string[]
}

export function RangeSlider({ min, max, value, onChange, labels }: RangeSliderProps) {
  const [start, end] = value
  const pct = (v: number) => ((v - min) / (max - min)) * 100

  return (
    <div className="relative w-full h-8 flex items-center">
      <div className="absolute w-full h-1 bg-border-strong rounded-full">
        <div
          className="absolute h-1 bg-accent rounded-full"
          style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }}
        />
      </div>
      <input
        type="range"
        min={min} max={max} value={start}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v <= end) onChange([v, end])
        }}
        className="absolute w-full appearance-none bg-transparent cursor-pointer range-thumb"
        style={{ zIndex: start === end && start === max ? 5 : 3 }}
      />
      <input
        type="range"
        min={min} max={max} value={end}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v >= start) onChange([start, v])
        }}
        className="absolute w-full appearance-none bg-transparent cursor-pointer range-thumb"
        style={{ zIndex: 4 }}
      />
      {labels && (
        <div className="absolute -bottom-5 w-full flex justify-between text-[9px] text-text-ghost">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  )
}
