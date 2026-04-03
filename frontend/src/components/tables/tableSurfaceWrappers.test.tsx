import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecurringPaymentsTable } from '../insights/RecurringPaymentsTable';
import { SpendingAnomaliesTable } from '../insights/SpendingAnomaliesTable';
import { CategoryBreakdownTable } from './CategoryBreakdownTable';

describe('card table surfaces', () => {
  it('do not add a wrapper border around category tables inside cards', () => {
    const { container } = render(
      <CategoryBreakdownTable
        rows={[
          {
            label: '식비',
            amount: 125000,
            share: 42.1,
          },
        ]}
        title="대분류"
      />,
    );

    const tableSurface = Array.from(container.querySelectorAll('div')).find((element) =>
      element.className.includes('overflow-hidden'),
    );

    expect(tableSurface).toBeDefined();
    expect(tableSurface?.className).not.toContain('border-[color:var(--color-border)]');
  });

  it('keeps insight tables borderless inside cards', () => {
    const recurring = render(
      <RecurringPaymentsTable
        items={[
          {
            merchant: '넷플릭스',
            category: '구독',
            avg_amount: 17000,
            avg_interval_days: 30,
            confidence: 0.92,
            interval_type: '매월',
            occurrences: 4,
            last_date: '2026-03-20',
          },
        ]}
      />,
    );
    const anomalies = render(
      <SpendingAnomaliesTable
        items={[
          {
            period: '2026-03',
            category: '여가',
            amount: 220000,
            baseline_avg: 110000,
            delta_pct: 100,
            anomaly_score: 0.97,
            reason: '평균 대비 2배 지출',
          },
        ]}
      />,
    );

    const recurringSurface = recurring.container.firstElementChild as HTMLElement | null;
    const anomaliesSurface = anomalies.container.firstElementChild as HTMLElement | null;

    expect(recurringSurface).not.toBeNull();
    expect(anomaliesSurface).not.toBeNull();
    expect(recurringSurface?.className).not.toContain('border-[color:var(--color-border)]');
    expect(anomaliesSurface?.className).not.toContain('border-[color:var(--color-border)]');
  });

  it('keeps recurring payment merchant column width stable and truncates long values', () => {
    const { container, getAllByText, getByText } = render(
      <RecurringPaymentsTable
        items={[
          {
            merchant: '매우 긴 거래처 이름이 반복 결제 테이블 레이아웃을 밀지 않도록 확인하는 테스트용 샘플',
            category: '구독',
            avg_amount: 17000,
            avg_interval_days: 30,
            confidence: 0.92,
            interval_type: '매월',
            occurrences: 4,
            last_date: '2026-03-20',
          },
        ]}
      />,
    );

    const table = container.querySelector('table');
    const merchantHeader = getByText('거래처');
    const merchantText = getAllByText(
      '매우 긴 거래처 이름이 반복 결제 테이블 레이아웃을 밀지 않도록 확인하는 테스트용 샘플',
    ).find((element) => element.tagName === 'SPAN');
    expect(merchantText).toBeDefined();
    if (!merchantText) {
      throw new Error('Expected desktop merchant cell text');
    }
    const merchantCell = merchantText.closest('td');

    expect(table?.className).toContain('table-fixed');
    expect(merchantHeader.className).toContain('w-[32%]');
    expect(merchantText.className).toContain('truncate');
    expect(merchantCell?.className).toContain('max-w-0');
  });

  it('renders mobile card variants for read-only tables while preserving desktop tables', () => {
    const category = render(
      <CategoryBreakdownTable
        rows={[
          {
            label: '식비',
            amount: 125000,
            share: 42.1,
          },
        ]}
        title="대분류"
      />,
    );
    const recurring = render(
      <RecurringPaymentsTable
        items={[
          {
            merchant: '넷플릭스',
            category: '구독',
            avg_amount: 17000,
            avg_interval_days: 30,
            confidence: 0.92,
            interval_type: '매월',
            occurrences: 4,
            last_date: '2026-03-20',
          },
        ]}
      />,
    );
    const anomalies = render(
      <SpendingAnomaliesTable
        items={[
          {
            period: '2026-03',
            category: '여가',
            amount: 220000,
            baseline_avg: 110000,
            delta_pct: 100,
            anomaly_score: 0.97,
            reason: '평균 대비 2배 지출',
          },
        ]}
      />,
    );

    const categoryDesktop = category.container.querySelector('.hidden.md\\:block');
    const categoryMobile = category.container.querySelector('.space-y-3.md\\:hidden');
    const recurringDesktop = recurring.container.querySelector('.hidden.md\\:block');
    const recurringMobile = recurring.container.querySelector('.space-y-3.md\\:hidden');
    const anomaliesDesktop = anomalies.container.querySelector('.hidden.md\\:block');
    const anomaliesMobile = anomalies.container.querySelector('.space-y-3.md\\:hidden');

    expect(categoryDesktop).not.toBeNull();
    expect(categoryMobile).not.toBeNull();
    expect(recurringDesktop).not.toBeNull();
    expect(recurringMobile).not.toBeNull();
    expect(anomaliesDesktop).not.toBeNull();
    expect(anomaliesMobile).not.toBeNull();
    expect(recurring.container.firstElementChild?.className).toContain('min-w-0');
    expect(recurring.container.firstElementChild?.className).toContain('w-full');
    expect(anomalies.container.firstElementChild?.className).toContain('min-w-0');
    expect(anomalies.container.firstElementChild?.className).toContain('w-full');
  });
});
