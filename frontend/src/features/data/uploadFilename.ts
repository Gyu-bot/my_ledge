const DATE_PATTERN = /(?<!\d)(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?!\d)/g

function toIsoDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(iso) ? iso : null
}

/**
 * BankSalad exports are named by their covered range (`start~end`).
 * The snapshot reflects the range end, so a range yields its end date;
 * a single date yields that date. Anything else is left for manual entry.
 */
export function snapshotDateFromFilename(filename: string): string | null {
  const matches = [...filename.matchAll(DATE_PATTERN)]
  if (matches.length === 0 || matches.length > 2) return null

  const dates = matches.map(([, year, month, day]) => toIsoDate(year, month, day))
  if (dates.some((date) => date === null)) return null

  if (matches.length === 2) {
    const [first, last] = matches
    const separator = filename.slice((first.index ?? 0) + first[0].length, last.index).trim()
    if (separator !== '~' || (dates[0] as string) > (dates[1] as string)) return null
  }
  return dates[dates.length - 1]
}
