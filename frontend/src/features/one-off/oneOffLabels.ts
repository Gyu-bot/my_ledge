import type { OneOffEventRejection, OneOffInactiveReason, OneOffMemberStatus, OneOffRejectionReason } from '../../types/oneOffEvents'

export const MEMBER_STATUS: Record<OneOffMemberStatus, string> = {
  counted: '집계 반영',
  fully_allocated: '환불 전액 배분',
  committed_now: '현재 약정',
  inactive: '비활성',
}

export const INACTIVE_REASON: Record<OneOffInactiveReason, string> = {
  deleted: '삭제됨',
  merged: '병합됨',
  superseded: '교체됨',
  not_expense: '지출 아님',
  non_krw: '원화 아님',
}

export const REJECTION_REASON: Record<OneOffRejectionReason, string> = {
  not_found: '거래를 찾을 수 없음',
  inactive: '삭제·병합·교체된 거래',
  not_expense: '지출 아님',
  non_krw: '원화 아님',
  committed: '대출·할부·정기 지급에 속한 약정 거래',
  in_other_event: '다른 일회성 묶음에 소속됨',
}

export function memberRejections(error: unknown): OneOffEventRejection[] {
  if (!(error instanceof Error) || !/^(409|422): /.test(error.message)) return []
  try {
    const payload: unknown = JSON.parse(error.message.slice(5))
    if (typeof payload !== 'object' || payload === null || !('detail' in payload) || !Array.isArray(payload.detail)) return []
    const details: unknown[] = payload.detail
    return details.filter((item): item is OneOffEventRejection => {
      if (typeof item !== 'object' || item === null) return false
      return 'transaction_id' in item && typeof item.transaction_id === 'number'
        && 'reason' in item && typeof item.reason === 'string' && Object.prototype.hasOwnProperty.call(REJECTION_REASON, item.reason)
    })
  } catch {
    return []
  }
}

export function oneOffEventLink(id: number): string {
  return `/data/one-off?event=${id}`
}
