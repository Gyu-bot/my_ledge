import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { OverviewPage } from './pages/OverviewPage'
import { SpendingPage } from './pages/SpendingPage'
import { AssetsPage } from './pages/AssetsPage'
import { InsightsPage } from './pages/InsightsPage'
import { WorkbenchPage } from './pages/WorkbenchPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'analysis/spending', element: <SpendingPage /> },
      { path: 'analysis/assets', element: <AssetsPage /> },
      { path: 'analysis/insights', element: <InsightsPage /> },
      { path: 'operations/workbench', element: <WorkbenchPage /> },
    ],
  },
  { path: '/spending', element: <Navigate to="/analysis/spending" replace /> },
  { path: '/assets', element: <Navigate to="/analysis/assets" replace /> },
  { path: '/data', element: <Navigate to="/operations/workbench" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
