import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HBarList } from '../../ds/charts/HBarList'
import { LineArea } from '../../ds/charts/LineArea'
import { MoMList } from '../../ds/charts/MoMList'
import { StackedBars } from '../../ds/charts/StackedBars'
import { Treemap } from '../../ds/charts/Treemap'
import { SegmentedBar } from '../../ds/SegmentedBar'

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

  it('스택 바는 환급을 음수 영역에 그리고 카테고리·월 합계를 순액으로 보존한다', () => {
    const { container } = render(<StackedBars items={[
      { period: '2026-09', category: '식비', amount: 3000 },
      { period: '2026-09', category: '보험', amount: -1000 },
      { period: '2026-09', category: '보험', amount: 200 },
    ]} />)
    expect(screen.getByText('2026-09 순합계 ₩2,200')).toBeInTheDocument()
    const refund = screen.getByText('2026-09 · 보험 -₩800').parentElement
    const zeroLine = container.querySelector('line[stroke="var(--ds-chart-axis)"]')
    expect(Number(refund?.getAttribute('y'))).toBeGreaterThanOrEqual(Number(zeroLine?.getAttribute('y1')))
    expect(Number(refund?.getAttribute('height'))).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '보험 -₩800' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '보험 -₩800' }))
    expect(screen.getByText('2026-09 순합계 ₩3,000')).toBeInTheDocument()
  })

  it('수평 막대와 트리맵은 음수 순환급을 누락하거나 양수로 바꾸지 않는다', () => {
    const { container } = render(<>
      <HBarList items={[{ label: '보험', amount: -1200 }, { label: '식비', amount: 3000 }]} />
      <Treemap items={[{ name: '보험사', group: '보험', value: -1200 }, { name: '상점', group: '식비', value: 3000 }]} />
    </>)
    expect(screen.getAllByText('-₩1,200').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('보험 · 보험사 -₩1,200')).toBeInTheDocument()
    expect(container.querySelectorAll('svg rect')).toHaveLength(2)
    expect(screen.getByText(/면적은 순액의 절댓값/)).toBeInTheDocument()
  })

  it('비율은 합계 100%로 반올림하고 환급과 0원은 거짓 비율 없이 표시한다', () => {
    const segments = ['필수', '재량', '미분류'].map((label) => ({ label, value: 1, color: 'red' }))
    const { rerender } = render(<SegmentedBar segments={segments} />)
    const shares = screen.getAllByText(/^\d+%$/).map((element) => Number(element.textContent?.replace('%', '')))
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(100)
    rerender(<SegmentedBar segments={[...segments.slice(0, 2), { label: '미분류', value: -2, color: 'gray' }]} />)
    expect(screen.getByText('환급으로 음수 항목이 있어 비율 대신 순액을 표시합니다.')).toBeInTheDocument()
    expect(screen.getByText('-₩2')).toBeInTheDocument()
    expect(screen.queryAllByText(/^\d+%$/)).toHaveLength(0)
    rerender(<SegmentedBar segments={segments.map((segment) => ({ ...segment, value: 0 }))} />)
    expect(screen.getByText('합계가 0원이어서 비율을 계산하지 않습니다.')).toBeInTheDocument()
  })

})
