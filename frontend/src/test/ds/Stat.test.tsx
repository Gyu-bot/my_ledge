import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../../ds/Badge'
import { Stat } from '../../ds/Stat'

describe('Stat', () => {
  it('라벨/값/보조 줄을 렌더한다', () => {
    render(<Stat label="순자산" value="₩4.21억" sub="기준일 06-07" />)
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('₩4.21억')).toBeInTheDocument()
    expect(screen.getByText('기준일 06-07')).toBeInTheDocument()
  })

  it('배지 슬롯을 값 옆에 렌더한다 (예: 추정치)', () => {
    render(<Stat label="이번 달 쓸 수 있는 돈" value="₩124만" badge={<Badge variant="estimate">예상</Badge>} />)
    expect(screen.getByText('예상')).toBeInTheDocument()
  })

  it('hero 변형은 display 타입 스케일을 쓴다', () => {
    render(<Stat hero label="이번 달 쓸 수 있는 돈" value="₩124만" />)
    expect(screen.getByText('₩124만').className).toContain('text-display')
  })
})
