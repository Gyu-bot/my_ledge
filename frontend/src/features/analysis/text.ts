/** 조회 실패를 쉬운 말로. apiFetch는 "상태코드: 본문" 형태의 Error를 던진다. */
export function loadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('401')) return 'API 키가 없거나 맞지 않아 자료를 읽지 못했습니다.'
  if (message.startsWith('503')) return '데이터베이스 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요.'
  if (message.startsWith('422')) return '요청한 달을 읽을 수 없습니다. 거래 기준일보다 뒤의 달일 수 있습니다.'
  return '자료를 불러오지 못했습니다.'
}

/** 0–1 비율 → "12.3%" (없으면 "—") */
export function sharePct(share: number | null | undefined): string {
  if (share == null || Number.isNaN(share)) return '—'
  return `${(share * 100).toFixed(1)}%`
}

/** 백엔드 설명 문장 속 괄호 안의 영문 내부 이름을 화면에서 뺀다. 예: "재량 분류(spend_necessity)" → "재량 분류" */
export function withoutCodeNames(text: string): string {
  return text
    .replace(/\s*\([a-z][a-z0-9_.]*\)/g, '')
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
}
