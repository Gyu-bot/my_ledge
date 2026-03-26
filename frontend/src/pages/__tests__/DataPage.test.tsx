import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDataManagement } from '../../hooks/useDataManagement';
import { DataPage } from '../DataPage';

vi.mock('../../hooks/useDataManagement', () => ({
  useDataManagement: vi.fn(),
}));

const mockedUseDataManagement = vi.mocked(useDataManagement);

describe('DataPage', () => {
  it('renders upload and transaction workbench sections', () => {
    mockedUseDataManagement.mockReturnValue({
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
        last_upload: null,
        has_write_access: true,
      },
      isPending: false,
      isError: false,
      error: null,
      pendingTransactionId: null,
      isUploading: false,
      uploadError: null,
      updateFilters: () => undefined,
      resetFilters: () => undefined,
      uploadWorkbookFile: async () => undefined,
      saveTransaction: async () => undefined,
      deleteTransactionRow: async () => undefined,
      restoreTransactionRow: async () => undefined,
    } as ReturnType<typeof useDataManagement>);

    render(<DataPage />);

    expect(screen.getByRole('heading', { level: 2, name: '데이터 관리' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '엑셀 업로드' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '최근 업로드 결과' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래 편집 작업대' })).toBeInTheDocument();
  });
});
