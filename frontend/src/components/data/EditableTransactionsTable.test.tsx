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
        onSave={onSave}
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
});
