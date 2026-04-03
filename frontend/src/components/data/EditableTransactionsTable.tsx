import { useEffect, useMemo, useState } from 'react';
import type {
  TransactionBulkUpdateRequest,
  TransactionResponse,
  TransactionUpdateRequest,
} from '../../types/transactions';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Textarea } from '../ui/textarea';

interface EditableTransactionsTableProps {
  rows: TransactionResponse[];
  categoryOptions: string[];
  hasWriteAccess: boolean;
  pendingTransactionId: number | null;
  isBulkSaving?: boolean;
  onSave: (transactionId: number, payload: TransactionUpdateRequest) => Promise<void>;
  onBulkSave: (
    ids: number[],
    payload: Omit<TransactionBulkUpdateRequest, 'ids'>,
  ) => Promise<void>;
  onDelete: (transactionId: number) => Promise<void>;
  onRestore: (transactionId: number) => Promise<void>;
}

interface DraftState {
  merchant: string;
  category_major_user: string;
  category_minor_user: string;
  memo: string;
}

interface BulkDraftState {
  merchant: string;
  category_major_user: string;
  category_minor_user: string;
  cost_kind: '' | 'fixed' | 'variable';
  fixed_cost_necessity: '' | 'essential' | 'discretionary';
  memo: string;
}

const EMPTY_DRAFT: DraftState = {
  merchant: '',
  category_major_user: '',
  category_minor_user: '',
  memo: '',
};

const EMPTY_BULK_DRAFT: BulkDraftState = {
  merchant: '',
  category_major_user: '',
  category_minor_user: '',
  cost_kind: '',
  fixed_cost_necessity: '',
  memo: '',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildInitialDraft(row: TransactionResponse): DraftState {
  return {
    merchant: row.merchant ?? row.description,
    category_major_user: row.category_major_user ?? row.effective_category_major ?? '',
    category_minor_user: row.category_minor_user ?? row.effective_category_minor ?? '',
    memo: row.memo ?? '',
  };
}

function buildBulkPayload(draft: BulkDraftState): Omit<TransactionBulkUpdateRequest, 'ids'> {
  const payload: Omit<TransactionBulkUpdateRequest, 'ids'> = {};

  if (draft.merchant.trim()) {
    payload.merchant = draft.merchant.trim();
  }
  if (draft.category_major_user.trim()) {
    payload.category_major_user = draft.category_major_user.trim();
  }
  if (draft.category_minor_user.trim()) {
    payload.category_minor_user = draft.category_minor_user.trim();
  }
  if (draft.cost_kind) {
    payload.cost_kind = draft.cost_kind;
    if (draft.cost_kind === 'variable') {
      payload.fixed_cost_necessity = null;
    }
  }
  if (draft.fixed_cost_necessity) {
    payload.fixed_cost_necessity = draft.fixed_cost_necessity;
  }
  if (draft.memo.trim()) {
    payload.memo = draft.memo.trim();
  }

  return payload;
}

function getCostKindLabel(value: TransactionResponse['cost_kind']) {
  if (value === 'fixed') {
    return '고정비';
  }
  if (value === 'variable') {
    return '변동비';
  }
  return '미지정';
}

function getFixedCostNecessityLabel(value: TransactionResponse['fixed_cost_necessity']) {
  if (value === 'essential') {
    return '필수';
  }
  if (value === 'discretionary') {
    return '비필수';
  }
  return '미지정';
}

export function EditableTransactionsTable({
  rows,
  categoryOptions,
  hasWriteAccess,
  pendingTransactionId,
  isBulkSaving = false,
  onSave,
  onBulkSave,
  onDelete,
  onRestore,
}: EditableTransactionsTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDraft, setBulkDraft] = useState<BulkDraftState>(EMPTY_BULK_DRAFT);

  const activeCategoryOptions = useMemo(
    () => Array.from(new Set(categoryOptions.filter(Boolean))).sort(),
    [categoryOptions],
  );
  const selectableRowIds = useMemo(
    () => rows.filter((row) => !row.is_deleted).map((row) => row.id),
    [rows],
  );
  const allCurrentRowsSelected =
    selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedIds.includes(id));
  const bulkPayload = buildBulkPayload(bulkDraft);
  const hasBulkChanges = Object.keys(bulkPayload).length > 0;
  const hasSelection = selectedIds.length > 0;

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => selectableRowIds.includes(id)));
    if (editingId !== null && !rows.some((row) => row.id === editingId)) {
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    }
  }, [editingId, rows, selectableRowIds]);

  const startEditing = (row: TransactionResponse) => {
    setSelectedIds([]);
    setBulkDraft(EMPTY_BULK_DRAFT);
    setEditingId(row.id);
    setDraft(buildInitialDraft(row));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setBulkDraft(EMPTY_BULK_DRAFT);
  };

  const handleRowSelection = (transactionId: number, checked: boolean) => {
    if (editingId !== null) {
      cancelEditing();
    }
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, transactionId])) : current.filter((id) => id !== transactionId),
    );
  };

  const handleSelectAllCurrentPage = (checked: boolean) => {
    if (editingId !== null) {
      cancelEditing();
    }
    setSelectedIds(checked ? selectableRowIds : []);
  };

  const handleSave = async (transactionId: number) => {
    await onSave(transactionId, {
      merchant: draft.merchant || null,
      category_major_user: draft.category_major_user || null,
      category_minor_user: draft.category_minor_user || null,
      memo: draft.memo || null,
    });
    cancelEditing();
  };

  const handleBulkSave = async () => {
    if (!hasBulkChanges || selectedIds.length === 0) {
      return;
    }
    await onBulkSave(selectedIds, bulkPayload);
    clearSelection();
  };

  return (
    <div className="space-y-4 overflow-x-auto">
      {hasSelection ? (
        <Card className="border-[color:var(--color-primary-soft)] bg-[color:var(--color-primary-soft)]/35">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[color:var(--color-text)]">
                  {selectedIds.length}건 선택됨
                </p>
                <p className="text-xs text-[color:var(--color-text-muted)]">
                  비워둔 필드는 수정하지 않습니다. 입력한 값만 선택한 거래 전체에 반영됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isBulkSaving || allCurrentRowsSelected || selectableRowIds.length === 0}
                  onClick={() => handleSelectAllCurrentPage(true)}
                  type="button"
                  variant="outline"
                >
                  현재 페이지 전체 선택
                </Button>
                <Button
                  disabled={isBulkSaving || selectedIds.length === 0}
                  onClick={clearSelection}
                  type="button"
                  variant="outline"
                >
                  선택 해제
                </Button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  공통 거래처
                </span>
                <Input
                  placeholder="공통 거래처"
                  value={bulkDraft.merchant}
                  onChange={(event) =>
                    setBulkDraft((current) => ({
                      ...current,
                      merchant: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  공통 대분류
                </span>
                <Select
                  onValueChange={(value) =>
                    setBulkDraft((current) => ({
                      ...current,
                      category_major_user: value === '__unset__' ? '' : value,
                    }))
                  }
                  value={bulkDraft.category_major_user || '__unset__'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unset__">수정 안 함</SelectItem>
                    {activeCategoryOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  공통 소분류
                </span>
                <Input
                  placeholder="공통 소분류"
                  value={bulkDraft.category_minor_user}
                  onChange={(event) =>
                    setBulkDraft((current) => ({
                      ...current,
                      category_minor_user: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  공통 고정비/변동비
                </span>
                <select
                  aria-label="공통 고정비/변동비"
                  className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text)]"
                  onChange={(event) =>
                    setBulkDraft((current) => ({
                      ...current,
                      cost_kind: event.target.value as BulkDraftState['cost_kind'],
                      fixed_cost_necessity:
                        event.target.value === 'variable'
                          ? ''
                          : current.fixed_cost_necessity,
                    }))
                  }
                  value={bulkDraft.cost_kind}
                >
                  <option value="">수정 안 함</option>
                  <option value="variable">변동비</option>
                  <option value="fixed">고정비</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  공통 고정비 필수 여부
                </span>
                <select
                  aria-label="공통 고정비 필수 여부"
                  className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text)] disabled:bg-[color:var(--color-surface-muted)]"
                  disabled={bulkDraft.cost_kind === 'variable'}
                  onChange={(event) =>
                    setBulkDraft((current) => ({
                      ...current,
                      fixed_cost_necessity:
                        event.target.value as BulkDraftState['fixed_cost_necessity'],
                    }))
                  }
                  value={bulkDraft.fixed_cost_necessity}
                >
                  <option value="">수정 안 함</option>
                  <option value="essential">필수</option>
                  <option value="discretionary">비필수</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  공통 메모
                </span>
                <Textarea
                  placeholder="공통 메모"
                  rows={3}
                  value={bulkDraft.memo}
                  onChange={(event) =>
                    setBulkDraft((current) => ({
                      ...current,
                      memo: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  disabled={!hasWriteAccess || isBulkSaving || !hasBulkChanges}
                  onClick={() => void handleBulkSave()}
                  type="button"
                >
                  일괄 수정 적용
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/80 xl:block">
        <Table density="compact">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14">
                <Checkbox
                  aria-label="현재 페이지 전체 선택"
                  checked={allCurrentRowsSelected}
                  disabled={editingId !== null || isBulkSaving || selectableRowIds.length === 0}
                  onCheckedChange={(checked) => handleSelectAllCurrentPage(checked === true)}
                />
              </TableHead>
              <TableHead>일시</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>거래처</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>분류</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead className="text-right">동작</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              const isPending = pendingTransactionId === row.id;
              const isSelected = selectedIds.includes(row.id);
              const singleActionDisabled = !hasWriteAccess || isPending || hasSelection || isBulkSaving;

              return (
                <TableRow key={row.id} className="align-top" data-state={isSelected ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`거래 ${row.id} 선택`}
                      checked={isSelected}
                      disabled={row.is_deleted || editingId !== null || isBulkSaving}
                      onCheckedChange={(checked) => handleRowSelection(row.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text-muted)]">
                    <div>{row.date}</div>
                    <div className="mt-1 text-xs">{row.time}</div>
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text)]">
                    <p className="font-semibold">{row.description}</p>
                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      {row.payment_method ?? '결제수단 없음'}
                    </p>
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text)]">
                    {isEditing ? (
                      <Input
                        placeholder="거래처"
                        value={draft.merchant}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            merchant: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <div>
                        <p className="font-medium">{row.merchant ?? row.description}</p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          분석 기준 거래처
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text)]">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Select
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              category_major_user: value === '__unset__' ? '' : value,
                            }))
                          }
                          value={draft.category_major_user || '__unset__'}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unset__">미지정</SelectItem>
                            {activeCategoryOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="소분류"
                          value={draft.category_minor_user}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              category_minor_user: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{row.effective_category_major}</p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          {row.effective_category_minor ?? '소분류 없음'}
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text)]">
                    <div>
                      <p className="font-medium">{getCostKindLabel(row.cost_kind)}</p>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        고정비 필수 여부 {getFixedCostNecessityLabel(row.fixed_cost_necessity)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text)]">
                    {isEditing ? (
                      <Textarea
                        className="min-w-[14rem]"
                        rows={3}
                        value={draft.memo}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            memo: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <span className="text-[color:var(--color-text-muted)]">
                        {row.memo ?? '메모 없음'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[color:var(--color-text-muted)]">
                    <div className="space-y-1">
                      {row.is_deleted ? (
                        <Badge className="w-fit normal-case tracking-normal" variant="destructive">
                          삭제됨
                        </Badge>
                      ) : row.is_edited ? (
                        <Badge className="w-fit normal-case tracking-normal" variant="accent">
                          사용자 수정
                        </Badge>
                      ) : (
                        <div className="text-xs">원본 상태</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-[color:var(--color-text)]">
                    {formatCurrency(row.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {row.is_deleted ? (
                        <Button
                          disabled={!hasWriteAccess || isPending || hasSelection || isBulkSaving}
                          onClick={() => void onRestore(row.id)}
                          size="sm"
                          type="button"
                        >
                          복원
                        </Button>
                      ) : isEditing ? (
                        <>
                          <Button
                            disabled={!hasWriteAccess || isPending}
                            onClick={() => void handleSave(row.id)}
                            size="sm"
                            type="button"
                          >
                            저장
                          </Button>
                          <Button
                            disabled={isPending}
                            onClick={cancelEditing}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            취소
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            disabled={singleActionDisabled}
                            onClick={() => startEditing(row)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            수정
                          </Button>
                          <Button
                            disabled={singleActionDisabled}
                            onClick={() => void onDelete(row.id)}
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            삭제
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 xl:hidden">
        {rows.map((row) => {
          const isEditing = editingId === row.id;
          const isPending = pendingTransactionId === row.id;
          const isSelected = selectedIds.includes(row.id);
          const singleActionDisabled = !hasWriteAccess || isPending || hasSelection || isBulkSaving;

          return (
            <Card key={row.id} className="bg-white/80">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--color-text)]">
                      {row.description}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      {row.date} {row.time}
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={`거래 ${row.id} 선택`}
                      checked={isSelected}
                      disabled={row.is_deleted || editingId !== null || isBulkSaving}
                      onCheckedChange={(checked) => handleRowSelection(row.id, checked === true)}
                    />
                    <p className="text-sm font-semibold text-[color:var(--color-text)]">
                      {formatCurrency(row.amount)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {isEditing ? (
                    <>
                      <Input
                        placeholder="거래처"
                        value={draft.merchant}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            merchant: event.target.value,
                          }))
                        }
                      />
                      <Select
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            category_major_user: value === '__unset__' ? '' : value,
                          }))
                        }
                        value={draft.category_major_user || '__unset__'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset__">미지정</SelectItem>
                          {activeCategoryOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="소분류"
                        value={draft.category_minor_user}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            category_minor_user: event.target.value,
                          }))
                        }
                      />
                      <Textarea
                        rows={3}
                        value={draft.memo}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            memo: event.target.value,
                          }))
                        }
                      />
                    </>
                  ) : (
                    <div className="grid gap-2 text-sm text-[color:var(--color-text-muted)]">
                      <p>거래처: {row.merchant ?? row.description}</p>
                      <p>카테고리: {row.effective_category_major}</p>
                      <p>소분류: {row.effective_category_minor ?? '소분류 없음'}</p>
                      <p>고정비/변동비: {getCostKindLabel(row.cost_kind)}</p>
                      <p>고정비 필수 여부: {getFixedCostNecessityLabel(row.fixed_cost_necessity)}</p>
                      <p>메모: {row.memo ?? '메모 없음'}</p>
                      <p>결제수단: {row.payment_method ?? '결제수단 없음'}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.is_deleted ? (
                    <Button
                      disabled={!hasWriteAccess || isPending || hasSelection || isBulkSaving}
                      onClick={() => void onRestore(row.id)}
                      size="sm"
                      type="button"
                    >
                      복원
                    </Button>
                  ) : isEditing ? (
                    <>
                      <Button
                        disabled={!hasWriteAccess || isPending}
                        onClick={() => void handleSave(row.id)}
                        size="sm"
                        type="button"
                      >
                        저장
                      </Button>
                      <Button
                        disabled={isPending}
                        onClick={cancelEditing}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        취소
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        disabled={singleActionDisabled}
                        onClick={() => startEditing(row)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        수정
                      </Button>
                      <Button
                        disabled={singleActionDisabled}
                        onClick={() => void onDelete(row.id)}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        삭제
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
