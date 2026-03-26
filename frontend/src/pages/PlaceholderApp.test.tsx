import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

vi.mock('../hooks/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('../hooks/useAssets', () => ({
  useAssets: vi.fn(),
}));

vi.mock('../hooks/useSpending', () => ({
  useSpending: vi.fn(),
}));

vi.mock('../hooks/useDataManagement', () => ({
  useDataManagement: vi.fn(),
}));

import { useDashboard } from '../hooks/useDashboard';
import { useAssets } from '../hooks/useAssets';
import { useDataManagement } from '../hooks/useDataManagement';
import { useSpending } from '../hooks/useSpending';

const mockedUseDashboard = vi.mocked(useDashboard);
const mockedUseAssets = vi.mocked(useAssets);
const mockedUseDataManagement = vi.mocked(useDataManagement);
const mockedUseSpending = vi.mocked(useSpending);

describe('App shell', () => {
  beforeEach(() => {
    mockedUseDashboard.mockReturnValue({
      data: {
        snapshot_date: '2026-03-24',
        summary_cards: [
          { label: '순자산', value: '₩106.8M', detail: '최신 스냅샷 기준' },
          { label: '총자산', value: '₩341.4M', detail: '전체 계좌 합산' },
          { label: '총부채', value: '₩234.6M', detail: '현재 잔액 기준' },
          { label: '이번 달 지출', value: '₩80K', detail: '2026년 3월' },
        ],
        monthly_spend: [
          { period: '2026-02', amount: -50 },
          { period: '2026-03', amount: -80 },
        ],
        category_breakdown: [
          { category: '교통', amount: 80, share: 61.5 },
          { category: '식비', amount: 50, share: 38.5 },
        ],
        recent_transactions: [
          {
            id: 1,
            date: '2026-03-24',
            time: '08:30:00',
            type: '지출',
            category_major: '교통',
            category_minor: null,
            category_major_user: null,
            category_minor_user: null,
            effective_category_major: '교통',
            effective_category_minor: null,
            description: '지하철',
            amount: -1450,
            currency: 'KRW',
            payment_method: '카드 A',
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-24T08:30:00',
            updated_at: '2026-03-24T08:30:00',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDashboard>);

    mockedUseAssets.mockReturnValue({
      data: {
        snapshot_date: '2026-03-24',
        summary_cards: [
          { label: '순자산', value: '106,814,249원', detail: '2026-03-24 기준' },
          { label: '총자산', value: '341,467,220원', detail: '최신 자산 스냅샷' },
          { label: '총부채', value: '234,652,971원', detail: '최신 부채 스냅샷' },
          { label: '투자 평가액', value: '16,254,104원', detail: '11개 자산' },
        ],
        net_worth_history: [{ period: '2026-03-24', amount: 106814248.62 }],
        investments: {
          snapshot_date: '2026-03-24',
          totals: { cost_basis: 15000000, market_value: 16254103.61 },
          items: [],
        },
        loans: {
          snapshot_date: '2026-03-24',
          totals: { principal: 240000000, balance: 234652971 },
          items: [],
        },
      },
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useAssets>);

    mockedUseSpending.mockReturnValue({
      data: {
        filters: {
          start_month: '',
          end_month: '',
          category_major: '',
          payment_method: '',
          search: '',
        },
        category_timeline: {
          categories: ['식비', '교통'],
          points: [{ period: '2026-03', values: { 식비: 240000, 교통: 120000 } }],
        },
        category_breakdown: [
          { label: '식비', amount: 240000 },
          { label: '교통', amount: 120000 },
        ],
        payment_methods: [
          { label: '카드 A', amount: 180000 },
          { label: '카드 B', amount: 90000 },
        ],
        transactions: [],
        filter_options: {
          categories: ['식비', '교통'],
          payment_methods: ['카드 A', '카드 B'],
        },
      },
      isPending: false,
      isError: false,
      error: null,
      updateFilters: vi.fn(),
      resetFilters: vi.fn(),
    } as ReturnType<typeof useSpending>);

    mockedUseDataManagement.mockReturnValue({
      data: {
        filters: {
          search: '',
          category_major: '',
          payment_method: '',
          include_deleted: false,
        },
        transactions: [],
        total: 0,
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
      updateFilters: vi.fn(),
      resetFilters: vi.fn(),
      uploadWorkbookFile: vi.fn(),
      saveTransaction: vi.fn(),
      deleteTransactionRow: vi.fn(),
      restoreTransactionRow: vi.fn(),
    } as ReturnType<typeof useDataManagement>);
  });

  it('renders the shared navigation and dashboard route by default', () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(screen.getByRole('link', { name: '대시보드' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '자산' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지출' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '데이터' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '본문으로 건너뛰기' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '개인 재무 대시보드' })).toBeInTheDocument();
    expect(screen.getByText(/월별 지출 추이/)).toBeInTheDocument();
  });

  it('renders the assets route page', () => {
    window.history.pushState({}, '', '/assets');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: '자산 현황' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '순자산 추이' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '투자 요약' })).toBeInTheDocument();
  });

  it('redirects unknown routes to the dashboard shell', () => {
    window.history.pushState({}, '', '/not-found');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: '대시보드' })).toBeInTheDocument();
    expect(screen.getByText(/월별 지출 추이/)).toBeInTheDocument();
  });

  it('renders the spending route page', () => {
    window.history.pushState({}, '', '/spending');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: '지출 분석' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '월별 카테고리 추이' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '카테고리별 지출' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '결제수단별 지출' })).toBeInTheDocument();
  });

  it('renders the data route page', () => {
    window.history.pushState({}, '', '/data');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: '데이터 관리' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '엑셀 업로드' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래 편집 작업대' })).toBeInTheDocument();
  });
});
