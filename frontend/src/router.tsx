import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { LegacySpendingRedirect } from './shell/LegacySpendingRedirect'
import { MonthClosePage } from './features/monthclose/MonthClosePage'
import { SpendingAnalysisPage } from './features/spending-analysis/SpendingAnalysisPage'
import { NetWorthPage } from './features/networth/NetWorthPage'
import { CommitmentsPage } from './features/commitments/CommitmentsPage'
import { ClassificationPage } from './features/workbench/ClassificationPage'
import { DataStatusPage } from './features/workbench/DataStatusPage'
import { NatureSettingsPage } from './features/workbench/NatureSettingsPage'
import { TransferPurposePage } from './features/workbench/TransferPurposePage'
import { OneOffEventsPage } from './features/one-off/OneOffEventsPage'
import { TransactionsPage } from './features/data/TransactionsPage'
import { LoansPage } from './features/data/LoansPage'
import { InstallmentsPage } from './features/data/InstallmentsPage'
import { AssetMetaPage } from './features/data/AssetMetaPage'
import { RulesPage } from './features/data/RulesPage'
import { SettingsPage } from './features/data/SettingsPage'
import { ImportPage } from './features/data/ImportPage'
import { ReferencePage } from './features/data/ReferencePage'

// IA — Implentation-plan.md 3.1 (T058: 월 결산·지출 분석이 홈·지출 6탭·신호를 대체,
// T059: 약정 현황과 작업대, T061: 재무상태와 이체 목적). 레거시 redirect 포함.

const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/analysis/spending', to: '/analysis' },
  { from: '/analysis/assets', to: '/net-worth' },
  { from: '/analysis/insights', to: '/analysis' },
  { from: '/signals', to: '/analysis' },
  { from: '/operations/workbench', to: '/data/transactions' },
  { from: '/operations/loan-mapping', to: '/data/loans' },
  { from: '/operations/installments', to: '/data/installments' },
  { from: '/operations/asset-settings', to: '/data/assets' },
  { from: '/operations/auto-classification', to: '/data/rules' },
  { from: '/operations/canonical-views', to: '/data/reference' },
  { from: '/operations/recurring-classification', to: '/data/nature?tab=recurring' },
  { from: '/assets', to: '/net-worth' },
  { from: '/income', to: '/' },
  { from: '/transfers', to: '/' },
]

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <MonthClosePage /> },
      { path: 'analysis', element: <SpendingAnalysisPage /> },
      { path: 'commitments', element: <CommitmentsPage /> },
      { path: 'net-worth', element: <NetWorthPage /> },
      { path: 'data/inbox', element: <ClassificationPage /> },
      { path: 'data/nature', element: <NatureSettingsPage /> },
      { path: 'data/transfers', element: <TransferPurposePage /> },
      { path: 'data/status', element: <DataStatusPage /> },
      { path: 'data/transactions', element: <TransactionsPage /> },
      { path: 'data/one-off', element: <OneOffEventsPage /> },
      { path: 'data/loans', element: <LoansPage /> },
      { path: 'data/installments', element: <InstallmentsPage /> },
      { path: 'data/assets', element: <AssetMetaPage /> },
      { path: 'data/rules', element: <RulesPage /> },
      { path: 'data/settings', element: <SettingsPage /> },
      { path: 'data/import', element: <ImportPage /> },
      { path: 'data/reference', element: <ReferencePage /> },
      { path: 'data', element: <Navigate to="/data/inbox" replace /> },
    ],
  },
  // 예전 /spending?lens=… 는 탭에 따라 나뉜다 (shell/LegacySpendingRedirect.tsx)
  { path: '/spending', element: <LegacySpendingRedirect /> },
  ...LEGACY_REDIRECTS.map(({ from, to }) => ({ path: from, element: <Navigate to={to} replace /> })),
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
