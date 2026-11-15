import type { BadgeVariant } from '../../ds/Badge'

/** 업로드 기록의 상태값을 쉬운 말로 (영어 상태값을 화면에 내지 않는다). */
export const UPLOAD_STATUS_TEXT: Record<string, { label: string; variant: BadgeVariant }> = {
  success: { label: '반영됨', variant: 'accent' },
  partial: { label: '일부만 반영', variant: 'warn' },
  failed: { label: '실패', variant: 'expense' },
  processing: { label: '처리 중', variant: 'neutral' },
  rolled_back: { label: '되돌림', variant: 'neutral' },
}

export function uploadStatus(status: string | null): { label: string; variant: BadgeVariant } {
  if (!status) return { label: '상태 기록 없음', variant: 'neutral' }
  return UPLOAD_STATUS_TEXT[status] ?? { label: '상태 확인 필요', variant: 'neutral' }
}
