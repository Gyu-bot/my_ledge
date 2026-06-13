import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { HomePage } from './features/home/HomePage'
import { NetWorthPage } from './features/networth/NetWorthPage'
import { SignalsPage } from './features/signals/SignalsPage'
import { SpendingPage } from './features/spending/SpendingPage'
import { InboxPage } from './features/data/InboxPage'
import { TransactionsPage } from './features/data/TransactionsPage'
import { LoansPage } from './features/data/LoansPage'
import { InstallmentsPage } from './features/data/InstallmentsPage'
import { AssetMetaPage } from './features/data/AssetMetaPage'
import { RulesPage } from './features/data/RulesPage'
import { SettingsPage } from './features/data/SettingsPage'
import { ImportPage } from './features/data/ImportPage'
import { ReferencePage } from './features/data/ReferencePage'

// 새 IA — docs/frontend-remake/02-ia-redesign.md §2, §5 (레거시 redirect 포함)

const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/analysis/spending', to: '/spending' },
  { from: '/analysis/assets', to: '/net-worth' },
  { from: '/analysis/insights', to: '/signals' },
  { from: '/operations/workbench', to: '/data/transactions' },
  { from: '/operations/loan-mapping', to: '/data/loans' },
  { from: '/operations/installments', to: '/data/installments' },
  { from: '/operations/asset-settings', to: '/data/assets' },
  { from: '/operations/auto-classification', to: '/data/rules' },
  { from: '/operations/canonical-views', to: '/data/reference' },
  { from: '/operations/recurring-classification', to: '/data/transactions?view=groups' },
  { from: '/assets', to: '/net-worth' },
  { from: '/income', to: '/' },
  { from: '/transfers', to: '/' },
]

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'spending', element: <SpendingPage /> },
      { path: 'net-worth', element: <NetWorthPage /> },
      { path: 'signals', element: <SignalsPage /> },
      { path: 'data/inbox', element: <InboxPage /> },
      { path: 'data/transactions', element: <TransactionsPage /> },
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
  ...LEGACY_REDIRECTS.map(({ from, to }) => ({ path: from, element: <Navigate to={to} replace /> })),
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
