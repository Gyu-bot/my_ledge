interface MonthRange {
  start_date: string
  end_date: string
}

function toMonthString(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function monthToDateRange(month: string): MonthRange {
  const [year, monthValue] = month.split('-').map(Number)
  const lastDay = new Date(year, monthValue, 0).getDate()
  return {
    start_date: `${month}-01`,
    end_date: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function monthSpanToDateRange(
  startMonth?: string,
  endMonth?: string,
): Partial<MonthRange> {
  const range: Partial<MonthRange> = {}

  if (startMonth) range.start_date = `${startMonth}-01`
  if (endMonth) range.end_date = monthToDateRange(endMonth).end_date

  return range
}

export function recentMonthsToDateRange(
  months: number,
  referenceDate = new Date(),
): MonthRange {
  const endYear = referenceDate.getFullYear()
  const endMonthIndex = referenceDate.getMonth()
  const start = new Date(endYear, endMonthIndex - Math.max(months - 1, 0), 1)
  const startMonth = toMonthString(start.getFullYear(), start.getMonth())
  const endMonth = toMonthString(endYear, endMonthIndex)

  return {
    start_date: `${startMonth}-01`,
    end_date: monthToDateRange(endMonth).end_date,
  }
}
