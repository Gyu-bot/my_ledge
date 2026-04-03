import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableTransactionsTable } from './EditableTransactionsTable';

describe('EditableTransactionsTable', () => {
  it('keeps description read-only and allows merchant editing', async () => {
    const onSave = vi.fn(async () => undefined);

    render(
      <EditableTransactionsTable
        rows={[
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
            description: '스타벅스 리저브 종로점',
            merchant: '스타벅스',
            amount: -12000,
            currency: 'KRW',
            payment_method: '카드 A',
            cost_kind: null,
            fixed_cost_necessity: null,
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: true,
            source: 'import',
            created_at: '2026-03-24T09:30:00',
            updated_at: '2026-03-24T09:30:00',
          },
        ]}
        categoryOptions={['식비']}
        hasWriteAccess
        pendingTransactionId={null}
        isBulkSaving={false}
        onSave={onSave}
        onBulkSave={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        onRestore={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getAllByText('스타벅스 리저브 종로점').length).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    });

    const merchantInput = screen.getAllByPlaceholderText('거래처')[0];
    act(() => {
      fireEvent.change(merchantInput, {
        target: {
          value: '스타벅스',
        },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '저장' })[0]);
    });

    expect(onSave).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        merchant: '스타벅스',
      }),
    );
    expect(screen.getAllByText('스타벅스 리저브 종로점').length).toBeGreaterThan(0);
  });

  it('shows a bulk edit toolbar for checked rows and applies shared edits once', async () => {
    const onBulkSave = vi.fn(async () => undefined);

    render(
      <EditableTransactionsTable
        rows={[
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
            description: '스타벅스 리저브 종로점',
            merchant: '스타벅스',
            amount: -12000,
            currency: 'KRW',
            payment_method: '카드 A',
            cost_kind: null,
            fixed_cost_necessity: null,
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: true,
            source: 'import',
            created_at: '2026-03-24T09:30:00',
            updated_at: '2026-03-24T09:30:00',
          },
          {
            id: 2,
            date: '2026-03-25',
            time: '10:00:00',
            type: '지출',
            category_major: '식비',
            category_minor: null,
            category_major_user: null,
            category_minor_user: null,
            effective_category_major: '식비',
            effective_category_minor: null,
            description: '블루보틀 성수',
            merchant: '블루보틀',
            amount: -9000,
            currency: 'KRW',
            payment_method: '카드 B',
            cost_kind: null,
            fixed_cost_necessity: null,
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-25T10:00:00',
            updated_at: '2026-03-25T10:00:00',
          },
        ]}
        categoryOptions={['식비', '카페']}
        hasWriteAccess
        pendingTransactionId={null}
        isBulkSaving={false}
        onSave={vi.fn(async () => undefined)}
        onBulkSave={onBulkSave}
        onDelete={vi.fn(async () => undefined)}
        onRestore={vi.fn(async () => undefined)}
      />,
    );

    act(() => {
      fireEvent.click(screen.getAllByRole('checkbox', { name: '거래 1 선택' })[0]);
      fireEvent.click(screen.getAllByRole('checkbox', { name: '거래 2 선택' })[0]);
    });

    expect(screen.getByText('2건 선택됨')).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByPlaceholderText('공통 거래처'), {
        target: { value: '카페 묶음' },
      });
      fireEvent.change(screen.getByLabelText('공통 고정비/변동비'), {
        target: { value: 'fixed' },
      });
      fireEvent.change(screen.getByLabelText('공통 고정비 필수 여부'), {
        target: { value: 'essential' },
      });
      fireEvent.change(screen.getByPlaceholderText('공통 메모'), {
        target: { value: '주간 검토 대상' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '일괄 수정 적용' }));
    });

    expect(onBulkSave).toHaveBeenCalledWith([1, 2], {
      cost_kind: 'fixed',
      fixed_cost_necessity: 'essential',
      merchant: '카페 묶음',
      memo: '주간 검토 대상',
    });
  });

  it('shows cost classification in the table and omits the upload source badge', () => {
    render(
      <EditableTransactionsTable
        rows={[
          {
            id: 1,
            date: '2026-03-24',
            time: '09:30:00',
            type: '지출',
            category_major: '주거',
            category_minor: '월세',
            category_major_user: null,
            category_minor_user: null,
            effective_category_major: '주거',
            effective_category_minor: '월세',
            description: '오피스텔 월세',
            merchant: '임대인',
            amount: -850000,
            currency: 'KRW',
            payment_method: '계좌이체',
            cost_kind: 'fixed',
            fixed_cost_necessity: 'essential',
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-24T09:30:00',
            updated_at: '2026-03-24T09:30:00',
          },
        ]}
        categoryOptions={['주거']}
        hasWriteAccess
        pendingTransactionId={null}
        isBulkSaving={false}
        onSave={vi.fn(async () => undefined)}
        onBulkSave={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        onRestore={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getAllByText('고정비').length).toBeGreaterThan(0);
    expect(screen.getByText(/고정비 필수 여부 필수/)).toBeInTheDocument();
    expect(screen.queryByText('업로드')).not.toBeInTheDocument();
  });
});
