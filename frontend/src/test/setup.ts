import '@testing-library/jest-dom'

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub

// jsdom은 창 스크롤을 구현하지 않는다 — 위치 기억(AppShell)을 시험할 수 있게 값만 기록한다.
// node 환경 테스트(빌드 이미지 등)에는 window가 없다.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: (x: number | ScrollToOptions, y?: number) => {
      const top = typeof x === 'number' ? (y ?? 0) : (x.top ?? 0)
      Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: top })
    },
  })
}
