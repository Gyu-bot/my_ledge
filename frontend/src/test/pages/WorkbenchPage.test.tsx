import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WorkbenchPage } from '../../pages/WorkbenchPage'

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => false,
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: () => ({
    data: { total: 1, page: 1, per_page: 20, items: [] },
    isLoading: false,
  }),
  useTransactionFilterOptions: () => ({
    data: { category_options: ['식비'], payment_method_options: ['카드'] },
  }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn() }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn() }),
  useRestoreTransaction: () => ({ mutateAsync: vi.fn() }),
  useBulkUpdateTransactions: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../hooks/useUpload', () => ({
  useUploadLogs: () => ({ data: { items: [] }, isLoading: false }),
  useUploadFile: () => ({ mutateAsync: vi.fn() }),
  useResetData: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge: vi.fn() }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkbenchPage', () => {
  it('renders the read-only banner when write access is unavailable', () => {
    wrap(<WorkbenchPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByText(/API 키가 없어 업로드·수정·삭제·초기화가 비활성화됩니다/)).toBeInTheDocument()
  })
})
