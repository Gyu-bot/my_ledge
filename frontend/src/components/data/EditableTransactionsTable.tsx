import { useMemo, useState } from 'react';
import type { TransactionResponse, TransactionUpdateRequest } from '../../types/transactions';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
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
  onSave: (transactionId: number, payload: TransactionUpdateRequest) => Promise<void>;
  onDelete: (transactionId: number) => Promise<void>;
  onRestore: (transactionId: number) => Promise<void>;
}

interface DraftState {
  category_major_user: string;
  category_minor_user: string;
  memo: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildInitialDraft(row: TransactionResponse): DraftState {
  return {
    category_major_user: row.category_major_user ?? row.effective_category_major ?? '',
    category_minor_user: row.category_minor_user ?? row.effective_category_minor ?? '',
    memo: row.memo ?? '',
  };
}

export function EditableTransactionsTable({
  rows,
  categoryOptions,
  hasWriteAccess,
  pendingTransactionId,
  onSave,
  onDelete,
  onRestore,
}: EditableTransactionsTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    category_major_user: '',
    category_minor_user: '',
    memo: '',
  });

  const activeCategoryOptions = useMemo(
    () => Array.from(new Set(categoryOptions.filter(Boolean))).sort(),
    [categoryOptions],
  );

  const startEditing = (row: TransactionResponse) => {
    setEditingId(row.id);
    setDraft(buildInitialDraft(row));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraft({
      category_major_user: '',
      category_minor_user: '',
      memo: '',
    });
  };

  const handleSave = async (transactionId: number) => {
    await onSave(transactionId, {
      category_major_user: draft.category_major_user || null,
      category_minor_user: draft.category_minor_user || null,
      memo: draft.memo || null,
    });
    cancelEditing();
  };

  return (
    <div className="overflow-x-auto">
      <div className="hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/80 xl:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>일시</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>카테고리</TableHead>
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

              return (
                <TableRow key={row.id} className="align-top">
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
                      <Badge className="w-fit normal-case tracking-normal">
                        {row.source === 'manual' ? '수동 입력' : '업로드'}
                      </Badge>
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
                          disabled={!hasWriteAccess || isPending}
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
                            disabled={!hasWriteAccess || isPending}
                            onClick={() => startEditing(row)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            수정
                          </Button>
                          <Button
                            disabled={!hasWriteAccess || isPending}
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

          return (
            <Card key={row.id} className="bg-white/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--color-text)]">
                      {row.description}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      {row.date} {row.time}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">
                    {formatCurrency(row.amount)}
                  </p>
                </div>

                <div className="mt-3 space-y-3">
                  {isEditing ? (
                    <>
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
                      <p>카테고리: {row.effective_category_major}</p>
                      <p>소분류: {row.effective_category_minor ?? '소분류 없음'}</p>
                      <p>메모: {row.memo ?? '메모 없음'}</p>
                      <p>결제수단: {row.payment_method ?? '결제수단 없음'}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {row.is_deleted ? (
                    <Button
                      disabled={!hasWriteAccess || isPending}
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
                        disabled={!hasWriteAccess || isPending}
                        onClick={() => startEditing(row)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        수정
                      </Button>
                      <Button
                        disabled={!hasWriteAccess || isPending}
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
