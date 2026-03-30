import { apiRequest, getApiKeyHeaders } from './client';

export type DataResetScope = 'transactions_only' | 'transactions_and_snapshots';

export interface DataResetResponse {
  scope: DataResetScope;
  deleted: {
    transactions: number;
    asset_snapshots: number;
    investments: number;
    loans: number;
  };
  upload_logs_retained: boolean;
}

export function resetData(scope: DataResetScope) {
  return apiRequest<DataResetResponse>('/data/reset', {
    method: 'POST',
    body: { scope },
    headers: getApiKeyHeaders(),
  });
}
