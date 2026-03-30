import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDataManagement } from '../../hooks/useDataManagement';
import { DataPage } from '../DataPage';

vi.mock('../../hooks/useDataManagement', () => ({
  useDataManagement: vi.fn(),
}));

const mockedUseDataManagement = vi.mocked(useDataManagement);

describe('DataPage', () => {
  function buildUseDataManagementResult() {
    return {
      data: {
        filters: {
          search: '',
          category_major: '',
          payment_method: '',
          include_deleted: false,
        },
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
        category_options: ['식비'],
        payment_method_options: ['카드 A'],
        upload_history: [],
        last_upload: null,
        has_write_access: true,
      },
      isPending: false,
      isError: false,
      error: null,
      pendingTransactionId: null,
      isUploading: false,
      isResetting: false,
      uploadError: null,
      actionFeedback: null,
      updateFilters: () => undefined,
      resetFilters: () => undefined,
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
      deleteTransactionRow: async () => undefined,
      restoreTransactionRow: async () => undefined,
    } as ReturnType<typeof useDataManagement>;
  }

  it('renders upload and transaction workbench sections', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    render(<DataPage />);

    expect(screen.getByRole('heading', { level: 2, name: '데이터 관리' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '엑셀 업로드' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '최근 업로드 결과' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Danger Zone' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래 편집 작업대' })).toBeInTheDocument();
  });

  it('keeps upload disabled until both file and snapshot date are provided', () => {
    mockedUseDataManagement.mockReturnValue(buildUseDataManagementResult());

    render(<DataPage />);

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

    render(<DataPage />);

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
