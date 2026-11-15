import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataStatusPage } from '../../features/workbench/DataStatusPage'
import { failed, loading, query } from './metricsFixtures'
import { readDataStatusFixture } from './workbenchFixtures'

let statusState: ReturnType<typeof query> | ReturnType<typeof failed> | ReturnType<typeof loading>

vi.mock('../../hooks/useMetrics', () => ({
  useReadDataStatus: () => statusState,
}))

vi.mock('../../hooks/useUpload', () => ({
  useUploadLogs: () => query({ items: [
    { id: 2, uploaded_at: '2026-08-15T09:00:00', filename: 'sample-export.xlsx', snapshot_date: '2026-08-14', tx_total: 10, tx_new: 4, tx_skipped: 6, status: 'success', error_message: null },
    { id: 1, uploaded_at: '2026-07-01T09:00:00', filename: 'sample-old.xlsx', snapshot_date: '2026-06-30', tx_total: 10, tx_new: 10, tx_skipped: 0, status: 'rolled_back', error_message: null },
  ] }),
}))

function renderPage() {
  return render(<MemoryRouter><DataStatusPage /></MemoryRouter>)
}

beforeEach(() => {
  statusState = query(readDataStatusFixture())
})

describe('DataStatusPage — 작업대 · 자료 현황', () => {
  it('가져온 범위, 기준일, 종류별 스냅샷, 가져오기 기록을 보인다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '작업대 · 자료 현황' })).toBeInTheDocument()
    expect(screen.getByText('2026년 8월 14일')).toBeInTheDocument()
    expect(screen.getByText('8개월')).toBeInTheDocument()
    expect(screen.getByText(/2026년 8월은 진행월\(부분 기록\)/)).toBeInTheDocument()
    expect(screen.getByText(/거래 기준일보다 45일 앞/)).toBeInTheDocument()
    expect(screen.getAllByText('가져온 스냅샷 없음')).toHaveLength(3)
    expect(screen.getByText('sample-export.xlsx')).toBeInTheDocument()
    expect(screen.getByText('반영됨')).toBeInTheDocument()
    expect(screen.getByText('되돌림')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/success|rolled_back|no_transactions/)
  })

  it('자료 공백(거래 0건인 달)과 분류 상태를 고칠 곳과 함께 보인다', () => {
    renderPage()
    expect(screen.getByText(/거래가 0건인 달: 2026년 5월/)).toBeInTheDocument()
    expect(screen.getByText('거래 0건')).toBeInTheDocument()
    expect(screen.getByText(/₩300,000 · 42건 · 총지급의 10.0%/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /분류 큐로/ })).toHaveAttribute('href', '/data/inbox')
    expect(screen.getByRole('link', { name: /할부 화면으로/ })).toHaveAttribute('href', '/data/installments?linked=unlinked')
    expect(screen.getByRole('link', { name: /정기 지급으로/ })).toHaveAttribute('href', '/data/nature?tab=recurring')
    // 남은 것이 없는 항목은 이동 링크가 없다
    expect(screen.queryByRole('link', { name: /거래 화면으로/ })).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: '달별 자료 상태' })
    expect(within(table).getByText('진행월 · 부분 기록')).toBeInTheDocument()
    expect(screen.getByText(/원화가 아닌 거래 1건/)).toBeInTheDocument()
  })

  it('거래가 없으면 가져오기로 안내한다', () => {
    statusState = query(readDataStatusFixture({ transaction_coverage: { transaction_as_of: null } }))
    renderPage()
    expect(screen.getByText(/아직 가져온 거래가 없습니다/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '가져오기로 가기' }).length).toBeGreaterThan(0)
  })

  it('읽기 실패와 불러오는 중을 구분한다', () => {
    statusState = failed('401: x')
    const view = renderPage()
    expect(screen.getByText('API 키가 없거나 맞지 않아 자료를 읽지 못했습니다.')).toBeInTheDocument()
    view.unmount()
    statusState = loading()
    renderPage()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
