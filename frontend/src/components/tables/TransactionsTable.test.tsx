import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransactionsTable } from './TransactionsTable';
import type { TransactionResponse } from '../../types/transactions';

describe('TransactionsTable', () => {
  it('keeps narrow metadata columns compact so description has more room', () => {
    const { container } = render(
      <TransactionsTable
        rows={[
          {
            id: 1,
            date: '2026-03-24',
            time: '08:30:00',
            type: '지출',
            category_major: '생활',
            category_minor: '고정비',
            category_major_user: null,
            category_minor_user: null,
            description: '생활비 자동이체 테스트',
            merchant: '생활비 자동이체',
            effective_category_major: '생활',
            effective_category_minor: '고정비',
            payment_method: '우리카드',
            amount: -25000,
            currency: 'KRW',
            cost_kind: null,
            fixed_cost_necessity: null,
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-24T08:30:00',
            updated_at: '2026-03-24T08:30:00',
          },
        ] satisfies TransactionResponse[]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: '일자' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('columnheader', { name: '일자' })).toHaveClass('h-8');
    expect(screen.getByRole('columnheader', { name: '거래처' })).toHaveClass('w-[34%]');
    expect(screen.getByRole('columnheader', { name: '결제수단' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: /우리카드/i })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: /우리카드/i })).toHaveClass('py-2');
    expect(screen.getByRole('cell', { name: '생활비 자동이체' })).toBeInTheDocument();

    const desktopTableSurface = Array.from(container.querySelectorAll('div')).find(
      (element) => element.className.includes('md:block') && element.className.includes('bg-white/80'),
    );

    expect(desktopTableSurface).toBeDefined();
    expect(desktopTableSurface?.className).not.toContain('border-[color:var(--color-border)]');
  });
});
