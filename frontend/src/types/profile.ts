export interface CreditScoreHistoryItem {
  snapshot_date: string
  credit_score_kcb: number | null
}

/** BankSalad `1.고객정보` 스냅샷 — 이름·이메일은 백엔드가 저장하지 않는다 */
export interface ProfileResponse {
  snapshot_date: string | null
  gender: string | null
  age: number | null
  credit_score_kcb: number | null
  credit_score_history: CreditScoreHistoryItem[]
}
