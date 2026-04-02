import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDataManagement } from '../../hooks/useDataManagement';
import { OperationsWorkbenchPage } from '../OperationsWorkbenchPage';

vi.mock('../../hooks/useDataManagement', () => ({
  useDataManagement: vi.fn(),
}));

const mockedUseDataManagement = vi.mocked(useDataManagement);

function buildUseDataManagementResult() {
  return {
    data: {
      filters: {
        search: '',
        transaction_type: '',
        source: '',
        category_major: '',
        payment_method: '',
        date_from: '',
        date_to: '',
        edited_only: false,
        include_deleted: false,
      },
      has_pending_filter_changes: false,
      transactions: [
        {
          id: 1,
          date: '2026-03-24',
          time: '09:30:00',
          type: '지출',
          category_major: '식비',
          category_minor: null,
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: null,
          description: '점심',
          amount: -12000,
          currency: 'KRW',
          payment_method: '카드 A',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-24T09:30:00',
          updated_at: '2026-03-24T09:30:00',
        },
      ],
      total: 1,
      current_page: 1,
      page_size: 20,
      total_pages: 1,
      category_options: ['식비'],
      payment_method_options: ['카드 A'],
      upload_history: [
        {
          id: 99,
          filename: 'finance_sample.xlsx',
          status: 'success',
          tx_total: 3,
          tx_new: 1,
          tx_skipped: 0,
          snapshot_date: '2026-03-24',
          uploaded_at: '2026-03-24T10:00:00',
          error_message: null,
        },
      ],
      last_upload: {
        upload_id: 24,
        status: 'success',
        transactions: {
          total: 3,
          new: 1,
          skipped: 2,
        },
        snapshots: {
          asset_snapshots: 1,
          investments: 1,
          loans: 0,
        },
        error_message: null,
      },
      has_write_access: true,
    },
    isPending: false,
    isError: false,
    error: null,
    pendingTransactionId: null,
    isBulkSaving: false,
    isUploading: false,
    isResetting: false,
    uploadError: null,
    actionFeedback: null,
    updateFilters: () => undefined,
    applyFilters: () => undefined,
    resetFilters: () => undefined,
    setPage: () => undefined,
    uploadWorkbookFile: vi.fn(async () => undefined),
    resetDataScope: vi.fn(async () => ({
      scope: 'transactions_only',
      deleted: {
        transactions: 0,
        asset_snapshots: 0,
        investments: 0,
        loans: 0,
      },
      upload_logs_retained: true,
    })),
    saveTransaction: async () => undefined,
    saveBulkTransactions: async () => undefined,
    deleteTransactionRow: async () => undefined,
    restoreTransactionRow: async () => undefined,
  } as ReturnType<typeof useDataManagement>;
}

describe('OperationsWorkbenchPage', () => {
  it('renders the transaction workbench as the primary surface and keeps operations tools in accordions', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    render(<OperationsWorkbenchPage />);

    expect(screen.getByRole('heading', { level: 2, name: '거래 작업대' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래 편집 작업대' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '필터 적용' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '업로드' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최근 업로드 이력' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Danger Zone' })).toBeInTheDocument();
    expect(
      screen.queryByText('BankSalad 내보내기 파일을 올려 거래와 스냅샷을 다시 적재합니다.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '작업대 요약' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '현재 필터' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '최근 업로드 맥락' })).not.toBeInTheDocument();
  });

  it('uses a full-width workbench layout instead of a split sidebar grid', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    const { container } = render(<OperationsWorkbenchPage />);
    const splitLayout = container.querySelector(
      '.xl\\:grid-cols-\\[minmax\\(0\\,1\\.45fr\\)_minmax\\(18rem\\,0\\.8fr\\)\\]',
    );

    expect(splitLayout).not.toBeInTheDocument();
  });

  it('does not render a legacy route banner in the canonical workbench view', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    render(<OperationsWorkbenchPage />);

    expect(screen.queryByText('/data 레거시 경로')).not.toBeInTheDocument();
  });

  it('keeps upload disabled until both file and snapshot date are provided', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    render(<OperationsWorkbenchPage />);

    fireEvent.click(screen.getByRole('button', { name: '업로드' }));

    const uploadButton = screen.getByRole('button', { name: '업로드 실행' });
    const fileInput = screen.getByLabelText('엑셀 파일');
    const snapshotDateInput = screen.getByLabelText('스냅샷 기준일');

    expect(uploadButton).toBeDisabled();

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['ledger'], 'finance_sample.xlsx')],
      },
    });

    expect(uploadButton).toBeDisabled();

    fireEvent.change(snapshotDateInput, {
      target: {
        value: '2026-03-24',
      },
    });

    expect(uploadButton).toBeEnabled();
  });

  it('keeps reset disabled until the confirmation text matches the selected scope', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    render(<OperationsWorkbenchPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));

    const resetButton = screen.getByRole('button', { name: '초기화 실행' });
    const confirmationInput = screen.getByPlaceholderText('실행하려면 거래초기화 입력');

    expect(resetButton).toBeDisabled();

    fireEvent.change(confirmationInput, {
      target: {
        value: '거래초기화',
      },
    });

    expect(resetButton).toBeEnabled();
  });
});
