import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetsPage } from '../AssetsPage';

vi.mock('../../hooks/useAssets', () => ({
  useAssets: vi.fn(),
}));

import { useAssets } from '../../hooks/useAssets';

const mockedUseAssets = vi.mocked(useAssets);

describe('AssetsPage', () => {
  it('renders net worth history, investments, and loans', () => {
    mockedUseAssets.mockReturnValue({
      data: {
        snapshot_date: '2026-03-24',
        summary_cards: [
          { label: '순자산', value: '106,814,249원', detail: '2026-03-24 기준' },
          { label: '총자산', value: '341,467,220원', detail: '최신 스냅샷' },
          { label: '총부채', value: '234,652,971원', detail: '최신 스냅샷' },
          { label: '투자 평가액', value: '16,254,104원', detail: '11개 자산' },
        ],
        net_worth_history: [
          { period: '2026-03-24', amount: 106814248.62 },
        ],
        investments: {
          snapshot_date: '2026-03-24',
          totals: {
            cost_basis: 15000000,
            market_value: 16254103.61,
          },
          allocation_breakdown: [
            {
              label: '해외 ETF',
              amount: 16254103.61,
              share: 100,
            },
          ],
          items: [
            {
              broker: '브로커 A',
              product_name: '해외 ETF',
              product_type: '해외주식',
              cost_basis: 15000000,
              market_value: 16254103.61,
              return_rate: 8.36,
            },
          ],
        },
        loans: {
          snapshot_date: '2026-03-24',
          totals: {
            principal: 240000000,
            balance: 234652971,
          },
          items: [
            {
              lender: '은행 A',
              product_name: '주택담보대출',
              loan_type: '담보대출',
              principal: 240000000,
              balance: 234652971,
              interest_rate: 3.8,
              start_date: '2025-01-01',
              maturity_date: '2055-01-01',
            },
          ],
        },
      },
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAssets>);

    render(<AssetsPage />);

    expect(screen.queryByRole('heading', { level: 2, name: '자산 현황' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '순자산 추이' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '순자산 추이 적용 기간' })).toHaveTextContent(
      '2026-03-24',
    );
    expect(screen.getByRole('heading', { level: 3, name: '투자 요약' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '투자 요약 기준일' })).toHaveTextContent('2026-03-24');
    expect(screen.getByRole('heading', { level: 3, name: '대출 요약' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '대출 요약 기준일' })).toHaveTextContent('2026-03-24');
    expect(screen.getByLabelText('투자 항목 비중 파이 차트')).toBeInTheDocument();
    expect(screen.getByText('단일 스냅샷')).toBeInTheDocument();
    expect(screen.queryByText('시계열 데이터 1건')).not.toBeInTheDocument();
  });
});
