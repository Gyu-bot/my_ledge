import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ImportPage } from '../../features/data/ImportPage'
import type { UploadPreviewResponse } from '../../types/upload'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

const mocks = vi.hoisted(() => ({
  previewMutateAsync: vi.fn(),
  applyMutateAsync: vi.fn(),
  resetMutateAsync: vi.fn(),
}))

vi.mock('../../hooks/useUpload', () => ({
  useUploadPreview: () => ({ mutateAsync: mocks.previewMutateAsync, isPending: false }),
  useApplyUploadPreview: () => ({ mutateAsync: mocks.applyMutateAsync, isPending: false }),
  useResetData: () => ({ mutateAsync: mocks.resetMutateAsync, isPending: false }),
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

const previewResponse: UploadPreviewResponse = {
  filename: 'finance.xlsx',
  snapshot_date: '2026-06-10',
  summary: {
    parsed_transaction_count: 3,
    safe_change_count: 1,
    review_required_count: 2,
    change_type_counts: {
      new: 1,
      unchanged: 0,
      source_fields_changed: 0,
      time_shifted: 0,
      possible_replacement: 1,
      missing_from_latest_export: 0,
      possible_duplicate: 1,
      ambiguous: 0,
    },
  },
  safe_changes: [
    {
      change_type: 'new',
      review_required: false,
      auto_apply_safe: true,
      reason: '새로운 원천 행입니다.',
      source_row_hash: 'safe-row',
      existing_transaction_id: null,
      candidate_transaction_ids: [],
      existing_source: null,
      incoming_source: {
        date: '2026-06-10',
        time: '09:30',
        type: '지출',
        category_major: '식비',
        category_minor: '카페',
        description: '커피',
        amount: -4800,
        currency: 'KRW',
        payment_method: '카드',
      },
      field_changes: [],
      preserved_user_fields: [],
      preservation_summary: '사용자 편집값 없음',
    },
  ],
  review_required_changes: [
    {
      change_type: 'possible_replacement',
      review_required: true,
      auto_apply_safe: false,
      reason: '기존 거래를 대체할 가능성이 있습니다.',
      source_row_hash: 'replacement-row',
      existing_transaction_id: 77,
      candidate_transaction_ids: [77],
      existing_source: {
        date: '2026-06-09',
        time: '09:20',
        type: '지출',
        category_major: '식비',
        category_minor: '카페',
        description: '커피',
        amount: -4800,
        currency: 'KRW',
        payment_method: '카드',
      },
      incoming_source: {
        date: '2026-06-10',
        time: '09:30',
        type: '지출',
        category_major: '식비',
        category_minor: '카페',
        description: '커피',
        amount: -4800,
        currency: 'KRW',
        payment_method: '카드',
      },
      field_changes: [{ field: 'date', existing_value: '2026-06-09', incoming_value: '2026-06-10' }],
      preserved_user_fields: ['memo'],
      preservation_summary: 'memo 보존',
    },
    {
      change_type: 'possible_duplicate',
      review_required: true,
      auto_apply_safe: false,
      reason: '중복 후보가 여럿입니다.',
      source_row_hash: 'duplicate-row',
      existing_transaction_id: null,
      candidate_transaction_ids: [90, 91],
      existing_source: null,
      incoming_source: {
        date: '2026-06-11',
        time: '11:00',
        type: '지출',
        category_major: '교통',
        category_minor: null,
        description: '택시',
        amount: -12000,
        currency: 'KRW',
        payment_method: '카드',
      },
      field_changes: [],
      preserved_user_fields: [],
      preservation_summary: '수동 확인 필요',
    },
  ],
}

function chooseFileAndDate(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  if (!input) return

  fireEvent.change(input, { target: { files: [new File(['xlsx'], 'finance.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] } })
  fireEvent.change(screen.getByLabelText('스냅샷 기준일 (필수)'), { target: { value: '2026-06-10' } })
}

describe('ImportPage', () => {
  beforeEach(() => {
    mocks.previewMutateAsync.mockReset()
    mocks.applyMutateAsync.mockReset()
    mocks.resetMutateAsync.mockReset()
    mocks.previewMutateAsync.mockResolvedValue(previewResponse)
    mocks.applyMutateAsync.mockResolvedValue({
      status: 'success',
      upload_id: 12,
      filename: 'finance.xlsx',
      snapshot_date: '2026-06-10',
      summary: {
        parsed_transaction_count: 3,
        selected_change_count: 1,
        applied_change_count: 1,
        change_type_counts: previewResponse.summary.change_type_counts,
      },
      applied_changes: [previewResponse.safe_changes[0]],
    })
    mocks.resetMutateAsync.mockResolvedValue({ scope: 'transactions_only', deleted: { transactions: 0, asset_snapshots: 0, investments: 0, loans: 0 }, upload_logs_retained: true })
  })

  it('업로드 카드, 관측 범위, 이력, Danger Zone을 렌더한다', () => {
    renderPage()
    expect(screen.getByText('업로드')).toBeInTheDocument()
    expect(screen.getByText(/관측 범위 2025-03-12 ~ 2026-06-10/)).toBeInTheDocument()
    expect(screen.getByText('finance.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
  })

  it('파일과 기준일로 미리보기를 만든 뒤 기본 선택된 안전 변경을 적용한다', async () => {
    const { container } = renderPage()
    chooseFileAndDate(container)

    fireEvent.click(screen.getByRole('button', { name: '미리보기 생성' }))

    expect(await screen.findByText('미리보기 결과')).toBeInTheDocument()
    expect(screen.getByText('안전 변경')).toBeInTheDocument()
    expect(screen.getAllByText('검토 필요').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '선택 1건 적용' }))

    await waitFor(() => {
      expect(mocks.applyMutateAsync).toHaveBeenCalledWith({
        file: expect.objectContaining({ name: 'finance.xlsx' }),
        snapshotDate: '2026-06-10',
        selections: [{ change_type: 'new', source_row_hash: 'safe-row', existing_transaction_id: null }],
      })
    })
  })

  it('중복 후보와 모호한 항목은 수동 확인 상태로 잠근다', async () => {
    const { container } = renderPage()
    chooseFileAndDate(container)

    fireEvent.click(screen.getByRole('button', { name: '미리보기 생성' }))

    const duplicateBadge = await screen.findByText('중복 후보')
    const duplicateRow = duplicateBadge.closest('button')
    expect(duplicateRow).toBeDisabled()
    expect(within(duplicateRow as HTMLButtonElement).getByText('수동 확인')).toBeInTheDocument()
  })

  it('초기화 실행 시 확인 문구 다이얼로그가 열린다 (스냅샷 포함 안내)', () => {
    renderPage()
    fireEvent.click(screen.getByText('거래 + 스냅샷 초기화').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: '초기화 실행' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/자산·보험·투자·대출 스냅샷이 모두 삭제/)).toBeInTheDocument()
  })
})
