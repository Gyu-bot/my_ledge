export interface AssetSnapshotTotalsResponse {
  snapshot_date: string;
  asset_total: string;
  liability_total: string;
  net_worth: string;
}

export interface AssetSnapshotsResponse {
  items: AssetSnapshotTotalsResponse[];
}

export interface NetWorthPointResponse {
  snapshot_date: string;
  net_worth: string;
}

export interface NetWorthHistoryResponse {
  items: NetWorthPointResponse[];
}

export interface InvestmentItemResponse {
  product_type: string | null;
  broker: string;
  product_name: string;
  cost_basis: string | null;
  market_value: string | null;
  return_rate: string | null;
}

export interface InvestmentTotalsResponse {
  cost_basis: string;
  market_value: string;
}

export interface InvestmentSummaryResponse {
  snapshot_date: string | null;
  items: InvestmentItemResponse[];
  totals: InvestmentTotalsResponse;
}

export interface LoanItemResponse {
  loan_type: string | null;
  lender: string;
  product_name: string;
  principal: string | null;
  balance: string | null;
  interest_rate: string | null;
  start_date: string | null;
  maturity_date: string | null;
}

export interface LoanTotalsResponse {
  principal: string;
  balance: string;
}

export interface LoanSummaryResponse {
  snapshot_date: string | null;
  items: LoanItemResponse[];
  totals: LoanTotalsResponse;
}
