import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { OverviewPage } from './pages/OverviewPage'
import { SpendingPage } from './pages/SpendingPage'
import { AssetsPage } from './pages/AssetsPage'
import { InsightsPage } from './pages/InsightsPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { NAVIGATION_ITEMS } from './navigation'

export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    children: NAVIGATION_ITEMS.map((item) =>
      item.path === '/'
        ? { index: true, element: <OverviewPage /> }
        : item.path === '/analysis/spending'
          ? { path: 'analysis/spending', element: <SpendingPage /> }
          : item.path === '/analysis/assets'
            ? { path: 'analysis/assets', element: <AssetsPage /> }
            : item.path === '/analysis/insights'
              ? { path: 'analysis/insights', element: <InsightsPage /> }
              : { path: 'operations/workbench', element: <WorkbenchPage /> },
    ),
  },
  { path: '/spending', element: <Navigate to="/analysis/spending" replace /> },
  { path: '/assets', element: <Navigate to="/analysis/assets" replace /> },
  { path: '/income', element: <Navigate to="/" replace /> },
  { path: '/transfers', element: <Navigate to="/" replace /> },
  { path: '/data', element: <Navigate to="/operations/workbench" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
