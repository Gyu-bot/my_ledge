import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HBarList } from '../../ds/charts/HBarList'
import { LineArea } from '../../ds/charts/LineArea'
import { MoMList } from '../../ds/charts/MoMList'

const duplicateKeyMessage = 'Encountered two children with the same key'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chart primitives', () => {
  it('LineArea는 중복 라벨과 동일 값 구간에서도 React key 경고 없이 렌더한다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <LineArea
        ariaLabel="순자산 추이"
        points={[
          { label: '2026-05-21', value: 121_889_999.54 },
          { label: '2026-05-21', value: 121_889_999.54 },
          { label: '2026-05-21', value: 121_889_999.54 },
        ]}
      />,
    )

    expect(consoleError.mock.calls.some(([message]) => String(message).includes(duplicateKeyMessage))).toBe(false)
  })

  it('HBarList는 같은 라벨 항목이 여러 개여도 React key 경고 없이 렌더한다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <HBarList
        items={[
          { label: '테슬라', amount: 1255 },
          { label: '테슬라', amount: 1400 },
        ]}
      />,
    )

    expect(consoleError.mock.calls.some(([message]) => String(message).includes(duplicateKeyMessage))).toBe(false)
  })

  it('MoMList는 API 비율 delta_pct를 화면 퍼센트와 증감액으로 표시한다', () => {
    const { getByText } = render(
      <MoMList
        items={[
          {
            category: '식비',
            current_amount: 740_000,
            previous_amount: 410_000,
            delta_amount: 330_000,
            delta_pct: 0.8049,
          },
        ]}
      />,
    )

    expect(getByText(/\+80\.5%/)).toBeInTheDocument()
    expect(getByText('+₩33만')).toBeInTheDocument()
  })
})
