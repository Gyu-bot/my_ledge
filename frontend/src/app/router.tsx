import { Navigate, Route, Routes } from 'react-router-dom';
import { PlaceholderApp } from '../pages/PlaceholderApp';
import { AppLayout } from './AppLayout';

const routeShells = [
  {
    path: '/',
    eyebrow: 'Overview',
    title: 'Dashboard',
    description: 'Route shell ready for dashboard insights, KPI cards, and recent activity.',
  },
  {
    path: '/assets',
    eyebrow: 'Net worth',
    title: 'Assets',
    description: 'Route shell ready for asset snapshots, investments, and loans.',
  },
  {
    path: '/spending',
    eyebrow: 'Transactions',
    title: 'Spending',
    description: 'Route shell ready for category filters, spend charts, and payment-method analysis.',
  },
  {
    path: '/data',
    eyebrow: 'Operations',
    title: 'Data',
    description: 'Route shell ready for uploads, transaction edits, and import history.',
  },
];

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {routeShells.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <PlaceholderApp
                description={route.description}
                eyebrow={route.eyebrow}
                title={route.title}
              />
            }
          />
        ))}
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
