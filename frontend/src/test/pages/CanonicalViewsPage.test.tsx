import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanonicalViewsPage } from '../../pages/CanonicalViewsPage'
import type { SchemaDocumentResponse } from '../../types/schema'

const mockUseSchemaDocument = vi.fn()
const setMetaBadge = vi.fn()

vi.mock('../../hooks/useSchema', () => ({
  useSchemaDocument: () => mockUseSchemaDocument(),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const schema: SchemaDocumentResponse = {
  tables: [],
  views: [
    {
      name: 'vw_transactions_effective',
      kind: 'view',
      description: 'Canonical transaction read model.',
      recommended_for_ai: true,
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false },
        { name: 'effective_category_major', type: 'VARCHAR(50)', nullable: false },
      ],
    },
    {
      name: 'vw_monthly_cashflow',
      kind: 'view',
      description: 'Canonical monthly cashflow aggregate.',
      recommended_for_ai: true,
      columns: [
        { name: 'income_total', type: 'INTEGER', nullable: false },
        { name: 'loan_repayment_total', type: 'INTEGER', nullable: false },
        { name: 'non_loan_expense_total', type: 'INTEGER', nullable: false },
      ],
    },
    {
      name: 'vw_unclassified_work_queue',
      kind: 'view',
      description: 'Canonical data-quality queue.',
      recommended_for_ai: true,
      columns: [
        { name: 'transaction_id', type: 'INTEGER', nullable: false },
        { name: 'needs_loan_link_review', type: 'BOOLEAN', nullable: false },
        { name: 'priority_score', type: 'INTEGER', nullable: false },
      ],
    },
  ],
}

beforeEach(() => {
  setMetaBadge.mockClear()
  mockUseSchemaDocument.mockReturnValue({
    data: schema,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
})

describe('CanonicalViewsPage', () => {
  it('shows advisor canonical views and their key fields', () => {
    wrap(<CanonicalViewsPage />)

    expect(screen.getAllByText('vw_monthly_cashflow').length).toBeGreaterThan(0)
    expect(screen.getAllByText('vw_unclassified_work_queue').length).toBeGreaterThan(0)
    expect(screen.getByText('loan_repayment_total')).toBeInTheDocument()
    expect(screen.getByText('priority_score')).toBeInTheDocument()
  })

  it('links data-quality queue work to existing operations pages', () => {
    wrap(<CanonicalViewsPage />)

    expect(screen.getByRole('link', { name: '자동분류' })).toHaveAttribute(
      'href',
      '/operations/auto-classification',
    )
    expect(screen.getByRole('link', { name: '대출 연결' })).toHaveAttribute(
      'href',
      '/operations/loan-mapping',
    )
    expect(screen.getByRole('link', { name: '반복 결제 분류' })).toHaveAttribute(
      'href',
      '/operations/recurring-classification',
    )
  })
})
