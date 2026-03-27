import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAssetsData, type AssetsApiResponse } from '../api/assets';
import { ensureArray, ensureObject } from '../lib/collections';

export interface AssetsSummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface NetWorthHistoryPoint {
  period: string;
  amount: number;
}

export interface InvestmentItem {
  product_type: string | null;
  broker: string;
  product_name: string;
  cost_basis: number | null;
  market_value: number | null;
  return_rate: number | null;
}

export interface LoanItem {
  loan_type: string | null;
  lender: string;
  product_name: string;
  principal: number | null;
  balance: number | null;
  interest_rate: number | null;
  start_date: string | null;
  maturity_date: string | null;
}

export interface AssetsData {
  snapshot_date: string | null;
  summary_cards: AssetsSummaryCard[];
  net_worth_history: NetWorthHistoryPoint[];
  investments: {
    snapshot_date: string | null;
    totals: {
      cost_basis: number;
      market_value: number;
    };
    items: InvestmentItem[];
  };
  loans: {
    snapshot_date: string | null;
    totals: {
      principal: number;
      balance: number;
    };
    items: LoanItem[];
  };
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return '기준일 없음';
  }

  return `${value} 기준`;
}

function buildSummaryCards(response: AssetsApiResponse): AssetsSummaryCard[] {
  const assetSnapshots = ensureArray(response.asset_snapshots?.items);
  const investmentItems = ensureArray(response.investments?.items);
  const investmentTotals = ensureObject(response.investments?.totals);
  const latestSnapshot = assetSnapshots[assetSnapshots.length - 1];

  return [
    {
      label: '순자산',
      value: latestSnapshot ? formatMoney(toNumber(latestSnapshot.net_worth)) : '데이터 없음',
      detail: latestSnapshot ? formatDateLabel(latestSnapshot.snapshot_date) : '자산 스냅샷 없음',
    },
    {
      label: '총자산',
      value: latestSnapshot ? formatMoney(toNumber(latestSnapshot.asset_total)) : '데이터 없음',
      detail: latestSnapshot ? '최신 자산 스냅샷' : '자산 스냅샷 없음',
    },
    {
      label: '총부채',
      value: latestSnapshot ? formatMoney(toNumber(latestSnapshot.liability_total)) : '데이터 없음',
      detail: latestSnapshot ? '최신 부채 스냅샷' : '부채 스냅샷 없음',
    },
    {
      label: '투자 평가액',
      value:
        investmentItems.length > 0
          ? formatMoney(toNumber(investmentTotals.market_value))
          : '데이터 없음',
      detail:
        investmentItems.length > 0
          ? `${investmentItems.length}개 자산`
          : '투자 스냅샷 없음',
    },
  ];
}

function buildAssetsData(response: AssetsApiResponse): AssetsData {
  const assetSnapshots = ensureArray(response.asset_snapshots?.items);
  const netWorthHistory = ensureArray(response.net_worth_history?.items);
  const investmentItems = ensureArray(response.investments?.items);
  const loanItems = ensureArray(response.loans?.items);
  const investments = ensureObject(response.investments);
  const investmentTotals = ensureObject(response.investments?.totals);
  const loans = ensureObject(response.loans);
  const loanTotals = ensureObject(response.loans?.totals);

  return {
    snapshot_date: assetSnapshots[assetSnapshots.length - 1]?.snapshot_date ?? null,
    summary_cards: buildSummaryCards(response),
    net_worth_history: netWorthHistory.map((item) => ({
      period: item.snapshot_date,
      amount: toNumber(item.net_worth),
    })),
    investments: {
      snapshot_date: investments.snapshot_date ?? null,
      totals: {
        cost_basis: toNumber(investmentTotals.cost_basis),
        market_value: toNumber(investmentTotals.market_value),
      },
      items: investmentItems.map((item) => ({
        ...item,
        cost_basis: item.cost_basis === null ? null : toNumber(item.cost_basis),
        market_value: item.market_value === null ? null : toNumber(item.market_value),
        return_rate: item.return_rate === null ? null : toNumber(item.return_rate),
      })),
    },
    loans: {
      snapshot_date: loans.snapshot_date ?? null,
      totals: {
        principal: toNumber(loanTotals.principal),
        balance: toNumber(loanTotals.balance),
      },
      items: loanItems.map((item) => ({
        ...item,
        principal: item.principal === null ? null : toNumber(item.principal),
        balance: item.balance === null ? null : toNumber(item.balance),
        interest_rate: item.interest_rate === null ? null : toNumber(item.interest_rate),
      })),
    },
  };
}

export interface UseAssetsResult {
  data: AssetsData | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  isFetching?: boolean;
  isLoading?: boolean;
  refetch?: UseQueryResult<AssetsData, Error>['refetch'];
}

export function useAssets(): UseAssetsResult {
  return useQuery<AssetsApiResponse, Error, AssetsData>({
    queryKey: ['assets-page'],
    queryFn: getAssetsData,
    select: buildAssetsData,
    staleTime: 5 * 60 * 1000,
  });
}
