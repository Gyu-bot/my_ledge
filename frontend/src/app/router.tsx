import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { PlaceholderApp } from '../pages/PlaceholderApp';
import { AppLayout } from './AppLayout';

const routeShells = [
  {
    path: '/assets',
    eyebrow: '자산',
    title: '자산 현황',
    description: '자산 스냅샷, 투자, 대출 화면을 연결할 준비가 된 페이지 셸입니다.',
  },
  {
    path: '/spending',
    eyebrow: '지출',
    title: '지출 분석',
    description: '카테고리 필터, 지출 차트, 결제수단 분석을 연결할 준비가 된 페이지 셸입니다.',
  },
  {
    path: '/data',
    eyebrow: '데이터',
    title: '데이터 관리',
    description: '업로드, 거래 수정, import 이력을 연결할 준비가 된 페이지 셸입니다.',
  },
];

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
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
