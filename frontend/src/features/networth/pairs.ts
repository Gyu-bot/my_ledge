// 대조 구간(자산 스냅샷 두 날짜)과 이체 목적 화면 사이의 주소 규칙.

export interface SnapshotPair {
  start_date: string
  end_date: string
}

export function pairKey(pair: SnapshotPair): string {
  return `${pair.start_date}~${pair.end_date}`
}

/** "2026-05-31~2026-06-30" → 구간 (형식이 틀리면 null) */
export function parsePairKey(value: string | null): SnapshotPair | null {
  if (!value) return null
  const [start, end] = value.split('~')
  return /^\d{4}-\d{2}-\d{2}$/.test(start ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(end ?? '') ? { start_date: start, end_date: end } : null
}

/** 이체 목적 정하기 화면으로 — 구간의 거래 범위를 기간 필터로 넘기고, 돌아올 구간을 함께 적는다 */
export function transferPurposeLink(range: { start_date: string; end_date: string }, undecidedOnly: boolean, back?: SnapshotPair): string {
  const params = new URLSearchParams({ start: range.start_date, end: range.end_date })
  if (undecidedOnly) params.set('undecided', '1')
  if (back) params.set('from', pairKey(back))
  return `/data/transfers?${params.toString()}`
}

/** 재무상태 화면의 그 구간으로 */
export function netWorthPairLink(pair: SnapshotPair): string {
  return `/net-worth?${new URLSearchParams({ start: pair.start_date, end: pair.end_date }).toString()}`
}
