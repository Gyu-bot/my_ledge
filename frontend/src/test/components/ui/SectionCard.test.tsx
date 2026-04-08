import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionCard } from '../../../components/ui/SectionCard'

describe('SectionCard', () => {
  it('renders description, meta, and action slots when provided', () => {
    render(
      <SectionCard
        title="월별 카테고리 추이"
        description="상위 카테고리 기준"
        meta="조회 기간 2025-10 ~ 2026-03"
        action={<button type="button">기간 변경</button>}
      >
        <div>body</div>
      </SectionCard>,
    )

    expect(screen.getByText('월별 카테고리 추이')).toBeInTheDocument()
    expect(screen.getByText('상위 카테고리 기준')).toBeInTheDocument()
    expect(screen.getByText('조회 기간 2025-10 ~ 2026-03')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기간 변경' })).toBeInTheDocument()
  })
})
