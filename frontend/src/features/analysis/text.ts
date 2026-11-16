/** 조회 실패를 쉬운 말로. apiFetch는 "상태코드: 본문" 형태의 Error를 던진다. */
export function loadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('401')) return 'API 키가 없거나 맞지 않아 자료를 읽지 못했습니다.'
  if (message.startsWith('503')) return '데이터베이스 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요.'
  if (message.startsWith('422')) return '요청한 달을 읽을 수 없습니다. 거래 기준일보다 뒤의 달일 수 있습니다.'
  return '자료를 불러오지 못했습니다.'
}

/** 저장 실패를 쉬운 말로 (개발자용 응답 본문을 화면에 내지 않는다). */
export function writeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('401')) return 'API 키가 없거나 맞지 않아 저장하지 못했습니다.'
  if (message.startsWith('404')) return '대상을 찾지 못했습니다. 이미 지워졌을 수 있습니다.'
  if (message.startsWith('409')) return '같은 대상이 이미 있거나 그사이 바뀌었습니다. 새로 고친 뒤 다시 해 주세요.'
  if (message.startsWith('422')) return '입력한 값을 저장할 수 없습니다. 날짜와 필수 칸을 확인해 주세요.'
  if (message.startsWith('503')) return '데이터베이스가 응답하지 않습니다. 잠시 뒤 다시 해 주세요.'
  return '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'
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
