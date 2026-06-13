export interface ToastItem {
  id: number
  variant: 'success' | 'error'
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

type Listener = () => void

let toasts: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export function dismissToast(id: number) {
  toasts = toasts.filter((item) => item.id !== id)
  emit()
}

function push(item: Omit<ToastItem, 'id'>): number {
  const id = nextId++
  toasts = [...toasts, { ...item, id }]
  emit()
  const ttl = item.action ? 8000 : 5000
  setTimeout(() => dismissToast(id), ttl)
  return id
}

/** 모듈 스토어 기반 토스트 — 라우터 컨텍스트 플럼빙 없이 어디서나 호출 */
export const toast = {
  success: (title: string, options: { description?: string; action?: ToastItem['action'] } = {}) =>
    push({ variant: 'success', title, ...options }),
  error: (title: string, options: { description?: string } = {}) =>
    push({ variant: 'error', title, ...options }),
  dismiss: dismissToast,
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToasts() {
  return toasts
}
