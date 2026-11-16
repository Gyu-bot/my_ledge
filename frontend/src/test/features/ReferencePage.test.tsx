import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReferencePage } from '../../features/data/ReferencePage'
import { projectionFixture } from './projectionFixtures'
import { monthFixture, query } from './metricsFixtures'
import { readDataStatusFixture } from './workbenchFixtures'

let projection = projectionFixture()
beforeEach(() => { projection = projectionFixture() })
vi.mock('../../hooks/useMetrics', () => ({
  useMonthProjection: () => query({ data: projection }),
  useMonthlyFlow: () => query({ items: [monthFixture('2026-06', 'in_progress')] }),
  useReadDataStatus: () => query(readDataStatusFixture()),
}))
vi.mock('../../hooks/useSchema', () => ({
  useSchemaDocument: () => query({ views: [
    { name: 'vw_additional_live_view', columns: [{ name: 'extra_column' }], recommended_for_ai: false },
    { name: 'vw_monthly_cashflow', columns: [{ name: 'income_total' }], recommended_for_ai: true },
  ] }),
}))

function renderPage() { render(<MemoryRouter><ReferencePage /></MemoryRouter>) }

describe('ReferencePage current read values', () => {
  it('관측과 전망을 나누고 수집 완전성을 단정하지 않는다', () => {
    renderPage()
    expect(screen.getByText('현금 잔여율')).toBeInTheDocument()
    expect(screen.getByText('진행월에는 내지 않음')).toBeInTheDocument()
    expect(screen.getByText(/달 전체 범위도 수집 완전성을 뜻하지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText('월말 예상 순현금흐름')).toBeInTheDocument()
    expect(screen.getByText(/2026-06 · 기준일 2026-06-10/)).toBeInTheDocument()
    expect(screen.getByText('vw_additional_live_view')).toBeInTheDocument()
    expect(screen.getByText(/업로드 결과와 원본 파일을 대조해 확인하세요/)).toBeInTheDocument()
  })

  it('옛 큐·거래처 평균 대신 현재 분류·비교·약정 화면으로 연결한다', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '분류 작업대' })).toHaveAttribute('href', '/data/inbox')
    expect(screen.getByRole('link', { name: '지출 변화와 거래처 비교' })).toHaveAttribute('href', '/analysis')
    expect(screen.getByRole('link', { name: '정기 지급과 약정' })).toHaveAttribute('href', '/commitments')
    expect(screen.queryByText('거래처 기준선')).not.toBeInTheDocument()
  })

  it('숫자가 있어도 빠진 구성 요소가 있으면 부분 합계로 표시한다', () => {
    projection = { ...projection, completeness: {
      status: 'known_components_only', status_label: '일부 구성 요소만 반영', full_projection_available: false,
      amount_scope: 'known_components', basis: '합성',
      left_out: [{ component: 'income_source', key: 'income:sample', name: '샘플 수입', reason_code: 'uncertain', reason: '수입 기록이 부족해 반영하지 않았습니다.' }],
    } }
    renderPage()
    expect(screen.getByText('반영 가능한 항목의 부분 합계')).toBeInTheDocument()
    expect(screen.queryByText('월말 예상 순현금흐름')).not.toBeInTheDocument()
    expect(screen.getByText(/전체 전망 아님/)).toBeInTheDocument()
    expect(screen.getByText(/샘플 수입: 수입 기록이 부족해/)).toBeInTheDocument()
  })
})
