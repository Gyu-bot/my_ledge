import { useQuery } from '@tanstack/react-query';
import {
  getCategoryMoM,
  getIncomeStability,
  getMerchantSpend,
  getMonthlyCashflow,
  getRecurringPayments,
  getSpendingAnomalies,
} from '../api/analytics';
import { formatSavingsRateValue } from '../lib/insightMetrics';
import { ensureArray } from '../lib/collections';
import type {
  CategoryMoMItemResponse,
  MerchantSpendItemResponse,
  RecurringPaymentItemResponse,
  RecurringPaymentsResponse,
  SpendingAnomaliesResponse,
  SpendingAnomalyItemResponse,
} from '../types/analytics';
import type { SummaryCard } from '../types/dashboard';

interface KeyInsightItem {
  title: string;
  description: string;
}

export interface InsightsData {
  summary_cards: SummaryCard[];
  key_insights: KeyInsightItem[];
  assumptions: string[];
  recurring_payments: RecurringPaymentItemResponse[];
  spending_anomalies: SpendingAnomalyItemResponse[];
  merchant_spend: MerchantSpendItemResponse[];
  category_mom: CategoryMoMItemResponse[];
}

export const INSIGHTS_CARD_PAGE_SIZE = 10;

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

export function useInsights() {
  return useQuery<InsightsData, Error>({
    queryKey: ['insights'],
    queryFn: async () => {
      const [
        monthlyCashflow,
        incomeStability,
        recurringPayments,
        spendingAnomalies,
        merchantSpend,
        categoryMoM,
      ] = await Promise.all([
        getMonthlyCashflow(),
        getIncomeStability(),
        getRecurringPayments({ page: 1, per_page: INSIGHTS_CARD_PAGE_SIZE }),
        getSpendingAnomalies({ page: 1, per_page: INSIGHTS_CARD_PAGE_SIZE }),
        getMerchantSpend({ type: '지출', limit: 5 }),
        getCategoryMoM({ type: '지출', level: 'major' }),
      ]);

      const cashflowItems = ensureArray(monthlyCashflow.items).sort((left, right) => left.period.localeCompare(right.period));
      const latestCashflow = cashflowItems[cashflowItems.length - 1];
      const recurringItems = ensureArray(recurringPayments.items);
      const anomalyItems = ensureArray(spendingAnomalies.items);
      const merchantItems = ensureArray(merchantSpend.items);
      const momItems = ensureArray(categoryMoM.items);

      return {
        summary_cards: [
          {
            label: '저축률',
            value: latestCashflow ? formatSavingsRateValue(latestCashflow) : '데이터 없음',
            detail: latestCashflow ? '최근 월 순현금흐름 기준' : '현금흐름 데이터 없음',
          },
          {
            label: '수입 변동성',
            value:
              incomeStability.coefficient_of_variation === null
                ? '데이터 없음'
                : incomeStability.coefficient_of_variation.toFixed(2),
            detail:
              incomeStability.coefficient_of_variation !== null &&
              incomeStability.coefficient_of_variation <= 0.1
                ? '낮은 변동성'
                : '월별 수입 편차 확인 필요',
          },
          {
            label: '이상 카테고리 수',
            value: `${new Set(anomalyItems.map((item) => item.category)).size}개`,
            detail: '최근 비교 구간 기준',
          },
        ],
        key_insights: [
          {
            title: latestCashflow && latestCashflow.net_cashflow >= 0 ? '현금흐름은 안정적입니다' : '현금흐름 확인이 필요합니다',
            description: latestCashflow
              ? `최근 월 순현금흐름은 ${formatMoney(latestCashflow.net_cashflow)}이고 저축률 지표는 ${formatSavingsRateValue(latestCashflow)}입니다.`
              : '최근 현금흐름 데이터가 충분하지 않습니다.',
          },
          {
            title: recurringItems.length > 0 ? '반복 결제가 늘고 있습니다' : '반복 결제 신호가 적습니다',
            description: recurringItems.length > 0
              ? `${recurringItems.slice(0, 2).map((item) => item.category).join(', ')} 카테고리에서 정기 결제 후보가 강하게 관측됩니다.`
              : '현재 탐지된 반복 결제 후보가 많지 않습니다.',
          },
          {
            title: anomalyItems.length > 0 ? '비정상 지출이 탐지되었습니다' : '이상 지출은 크지 않습니다',
            description: anomalyItems.length > 0
              ? `${anomalyItems[0].category} 카테고리가 baseline 대비 크게 증가했습니다.`
              : '최근 비교 구간에서 큰 이상 지출은 보이지 않습니다.',
          },
        ],
        assumptions: [
          `income-stability: ${incomeStability.assumptions}`,
          `recurring-payments: ${recurringPayments.assumptions}`,
          `spending-anomalies: ${spendingAnomalies.assumptions}`,
        ],
        recurring_payments: recurringItems,
        spending_anomalies: anomalyItems,
        merchant_spend: merchantItems,
        category_mom: momItems,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecurringPaymentsPage(page: number, perPage: number = INSIGHTS_CARD_PAGE_SIZE) {
  return useQuery<RecurringPaymentsResponse, Error>({
    queryKey: ['analytics', 'recurring-payments', page, perPage],
    queryFn: () => getRecurringPayments({ page, per_page: perPage }),
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendingAnomaliesPage(page: number, perPage: number = INSIGHTS_CARD_PAGE_SIZE) {
  return useQuery<SpendingAnomaliesResponse, Error>({
    queryKey: ['analytics', 'spending-anomalies', page, perPage],
    queryFn: () => getSpendingAnomalies({ page, per_page: perPage }),
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });
}
