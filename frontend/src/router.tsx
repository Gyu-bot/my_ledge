import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { OverviewPage } from './pages/OverviewPage'
import { SpendingPage } from './pages/SpendingPage'
import { AssetsPage } from './pages/AssetsPage'
import { InsightsPage } from './pages/InsightsPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { LoanMappingPage } from './pages/LoanMappingPage'
import { RecurringClassificationPage } from './pages/RecurringClassificationPage'
import { AutoClassificationPage } from './pages/AutoClassificationPage'
import { CanonicalViewsPage } from './pages/CanonicalViewsPage'
import { InstallmentsPage } from './pages/InstallmentsPage'

const routeElements = [
  { index: true, element: <OverviewPage /> },
  { path: 'analysis/spending', element: <SpendingPage /> },
  { path: 'analysis/assets', element: <AssetsPage /> },
  { path: 'analysis/insights', element: <InsightsPage /> },
  { path: 'operations/workbench', element: <WorkbenchPage /> },
  { path: 'operations/loan-mapping', element: <LoanMappingPage /> },
  { path: 'operations/installments', element: <InstallmentsPage /> },
  { path: 'operations/auto-classification', element: <AutoClassificationPage /> },
  { path: 'operations/canonical-views', element: <CanonicalViewsPage /> },
  { path: 'operations/recurring-classification', element: <RecurringClassificationPage /> },
]

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: routeElements,
  },
  { path: '/spending', element: <Navigate to="/analysis/spending" replace /> },
  { path: '/assets', element: <Navigate to="/analysis/assets" replace /> },
  { path: '/income', element: <Navigate to="/" replace /> },
  { path: '/transfers', element: <Navigate to="/" replace /> },
  { path: '/data', element: <Navigate to="/operations/workbench" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
