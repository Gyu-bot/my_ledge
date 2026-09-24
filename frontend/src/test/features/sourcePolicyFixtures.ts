import type { SelectedInvestments, SourcePolicy, SourcePolicyPreview } from '../../types/sourcePolicy'

export const sourcePolicy: SourcePolicy = {
  revision: 1, global_source: 'banksalad_snapshot', investment_source: 'banksalad_snapshot', stale_after_days: 7, account_overrides: [],
}
export const selectedInvestments: SelectedInvestments = {
  as_of_date: '2026-09-24', banksalad_snapshot_date: '2026-09-01', investment_total: '120000', investment_total_complete: true, confirmed_net_worth: '1000000', estimated_net_worth: '1020000', mixed_dates: true,
  warnings: ['transfer_timing_risk'],
  coverage: { raw: 3, selected: 1, excluded: 2, confirmed: 1, hidden: 0, conflicted: 1, stale: 1 },
  accounts: [{ account_key: 'broker:toss', broker: '토스증권', configured_source: 'toss_securities_api', effective_source: 'banksalad_snapshot', selected_run_id: 12, valuation_at: '2026-09-01T00:00:00+09:00', ingested_at: '2026-09-03T11:00:00+09:00', is_stale: true, fallback_reason: 'preferred_source_unavailable', conflicts: ['account_mapping_ambiguous'], holdings_count: 1, market_value: '120000' }],
  items: [{ account_key: 'broker:toss', instrument_key: 'KR:123', product_name: '테스트 주식', market_value: '120000', currency: 'KRW', source: 'banksalad_snapshot' }],
}
export const sourcePreview: SourcePolicyPreview = {
  policy: { global_source: 'banksalad_snapshot', investment_source: 'toss_securities_api', stale_after_days: 7, account_overrides: [] },
  current: { ...selectedInvestments, estimated_net_worth: '1000000' }, proposed: selectedInvestments, net_worth_delta: '20000', preview_token: 'preview-bound-to-policy-and-data',
}
