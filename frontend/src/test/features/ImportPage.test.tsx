import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ImportPage } from '../../features/data/ImportPage'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

vi.mock('../../hooks/useUpload', () => ({
  useUploadFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetData: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadLogs: () =>
    query({ items: [{ id: 1, uploaded_at: '2026-06-10T09:00:00', filename: 'finance.xlsx', snapshot_date: '2026-06-10', tx_total: 2219, tx_new: 150, tx_skipped: 2069, status: 'success', error_message: null }] }),
}))

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () => query({ data_coverage: { first_transaction_date: '2025-03-12', last_transaction_date: '2026-06-10' } }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage() {
  return render(<MemoryRouter><ImportPage /></MemoryRouter>)
}

describe('ImportPage', () => {
  it('업로드 카드, 관측 범위, 이력, Danger Zone을 렌더한다', () => {
    renderPage()
    expect(screen.getByText('업로드')).toBeInTheDocument()
    expect(screen.getByText(/관측 범위 2025-03-12 ~ 2026-06-10/)).toBeInTheDocument()
    expect(screen.getByText('finance.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
  })

  it('초기화 실행 시 확인 문구 다이얼로그가 열린다 (스냅샷 포함 안내)', () => {
    renderPage()
    fireEvent.click(screen.getByText('거래 + 스냅샷 초기화').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: '초기화 실행' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/자산·보험·투자·대출 스냅샷이 모두 삭제/)).toBeInTheDocument()
  })
})
