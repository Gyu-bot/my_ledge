import type { UploadResponse } from '../../api/upload';
import { SectionPlaceholder } from '../common/SectionPlaceholder';
import type { DataManagementFilterValues } from '../data/DataManagementFilterBar';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface WorkbenchSidebarProps {
  filters: DataManagementFilterValues;
  total: number;
  visibleCount: number;
  currentPage: number;
  totalPages: number;
  hasWriteAccess: boolean;
  lastUpload: UploadResponse | null;
}

function buildFilterSummary(filters: DataManagementFilterValues) {
  const items: string[] = [];

  if (filters.search) {
    items.push(`검색: ${filters.search}`);
  }
  if (filters.transaction_type) {
    items.push(`유형: ${filters.transaction_type}`);
  }
  if (filters.source) {
    items.push(`출처: ${filters.source === 'manual' ? '수동 입력' : '업로드'}`);
  }
  if (filters.category_major) {
    items.push(`대분류: ${filters.category_major}`);
  }
  if (filters.payment_method) {
    items.push(`결제수단: ${filters.payment_method}`);
  }
  if (filters.date_from || filters.date_to) {
    items.push(`기간: ${filters.date_from || '시작'} ~ ${filters.date_to || '종료'}`);
  }
  if (filters.edited_only) {
    items.push('사용자 수정만');
  }
  if (filters.include_deleted) {
    items.push('삭제 포함');
  }

  return items;
}

export function WorkbenchSidebar({
  filters,
  total,
  visibleCount,
  currentPage,
  totalPages,
  hasWriteAccess,
  lastUpload,
}: WorkbenchSidebarProps) {
  const activeFilters = buildFilterSummary(filters);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)]">
        <CardHeader>
          <CardTitle className="text-lg">작업대 요약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
              <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                현재 표시
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                {visibleCount}건
              </p>
              <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                {currentPage} / {totalPages} 페이지
              </p>
            </div>
            <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
              <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                필터 결과
              </p>
              <p className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">
                {total}건
              </p>
              <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                조건에 맞는 전체 거래 수
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">현재 필터</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              수정 권한
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--color-text)]">
              {hasWriteAccess ? '쓰기 가능' : '읽기 전용'}
            </p>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              {hasWriteAccess
                ? '업로드, 수정, 삭제, 복원을 바로 실행할 수 있습니다.'
                : 'API 키가 없어 업로드와 편집은 잠겨 있습니다.'}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              현재 필터
            </p>
            {activeFilters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[color:var(--color-text-muted)]">
                적용된 필터 없이 최신 거래를 기준으로 작업 중입니다.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">최근 업로드 맥락</CardTitle>
        </CardHeader>
        <CardContent>
          {lastUpload ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--color-text)]">
                  업로드 ID {lastUpload.upload_id}
                </p>
                <Badge variant={lastUpload.status === 'failed' ? 'destructive' : 'secondary'}>
                  {lastUpload.status}
                </Badge>
              </div>
              <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-sm text-[color:var(--color-text-muted)]">
                <p>거래 신규 {lastUpload.transactions.new}건</p>
                <p className="mt-1">거래 스킵 {lastUpload.transactions.skipped}건</p>
                <p className="mt-1">
                  자산 {lastUpload.snapshots.asset_snapshots} · 투자 {lastUpload.snapshots.investments}
                  {' '}· 대출 {lastUpload.snapshots.loans}
                </p>
              </div>
            </div>
          ) : (
            <SectionPlaceholder
              title="최근 업로드 없음"
              description="업로드를 실행하면 바로 이 패널에서 결과 맥락을 확인할 수 있습니다."
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
