import { Navigate, Route, Routes } from 'react-router-dom';
import { AssetsPage } from '../pages/AssetsPage';
import { InsightsPage } from '../pages/InsightsPage';
import { OperationsWorkbenchPage } from '../pages/OperationsWorkbenchPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SpendingPage } from '../pages/SpendingPage';
import { AppLayout } from './AppLayout';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/analysis/spending" element={<SpendingPage />} />
        <Route path="/analysis/assets" element={<AssetsPage />} />
        <Route path="/analysis/insights" element={<InsightsPage />} />
        <Route path="/operations/workbench" element={<OperationsWorkbenchPage />} />
        <Route path="/spending" element={<Navigate replace to="/analysis/spending" />} />
        <Route path="/assets" element={<Navigate replace to="/analysis/assets" />} />
        <Route path="/data" element={<Navigate replace to="/operations/workbench" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
