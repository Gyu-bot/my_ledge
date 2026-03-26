import { useMemo, useState } from 'react';
import type { TransactionResponse, TransactionUpdateRequest } from '../../types/transactions';

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
      <table className="hidden min-w-full border-separate border-spacing-y-2 xl:table">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">
            <th className="px-4 pb-2 font-medium">일시</th>
            <th className="px-4 pb-2 font-medium">설명</th>
            <th className="px-4 pb-2 font-medium">카테고리</th>
            <th className="px-4 pb-2 font-medium">메모</th>
            <th className="px-4 pb-2 font-medium">상태</th>
            <th className="px-4 pb-2 text-right font-medium">금액</th>
            <th className="px-4 pb-2 text-right font-medium">동작</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            const isPending = pendingTransactionId === row.id;

            return (
              <tr
                key={row.id}
                className="rounded-2xl bg-white/80 align-top shadow-[0_12px_24px_-18px_rgba(30,64,175,0.35)]"
              >
                <td className="rounded-l-2xl px-4 py-4 text-sm text-[color:var(--color-text-muted)]">
                  <div>{row.date}</div>
                  <div className="mt-1 text-xs">{row.time}</div>
                </td>
                <td className="px-4 py-4 text-sm text-[color:var(--color-text)]">
                  <p className="font-semibold">{row.description}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    {row.payment_method ?? '결제수단 없음'}
                  </p>
                </td>
                <td className="px-4 py-4 text-sm text-[color:var(--color-text)]">
                  {isEditing ? (
                    <div className="space-y-2">
                      <select
                        value={draft.category_major_user}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            category_major_user: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">미지정</option>
                        {activeCategoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={draft.category_minor_user}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            category_minor_user: event.target.value,
                          }))
                        }
                        placeholder="소분류"
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                </td>
                <td className="px-4 py-4 text-sm text-[color:var(--color-text)]">
                  {isEditing ? (
                    <textarea
                      value={draft.memo}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          memo: event.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full min-w-[14rem] rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <span className="text-[color:var(--color-text-muted)]">{row.memo ?? '메모 없음'}</span>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-[color:var(--color-text-muted)]">
                  <div className="space-y-1">
                    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {row.source === 'manual' ? '수동 입력' : '업로드'}
                    </span>
                    {row.is_deleted ? (
                      <div className="text-xs text-rose-600">삭제됨</div>
                    ) : row.is_edited ? (
                      <div className="text-xs text-amber-700">사용자 수정</div>
                    ) : (
                      <div className="text-xs">원본 상태</div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-right text-sm font-semibold text-[color:var(--color-text)]">
                  {formatCurrency(row.amount)}
                </td>
                <td className="rounded-r-2xl px-4 py-4">
                  <div className="flex justify-end gap-2">
                    {row.is_deleted ? (
                      <button
                        type="button"
                        disabled={!hasWriteAccess || isPending}
                        onClick={() => void onRestore(row.id)}
                        className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        복원
                      </button>
                    ) : isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={!hasWriteAccess || isPending}
                          onClick={() => void handleSave(row.id)}
                          className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={cancelEditing}
                          className="rounded-full border border-[color:var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--color-text-muted)] transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!hasWriteAccess || isPending}
                          onClick={() => startEditing(row)}
                          className="rounded-full border border-[color:var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--color-text)] transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          disabled={!hasWriteAccess || isPending}
                          onClick={() => void onDelete(row.id)}
                          className="rounded-full bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="space-y-3 xl:hidden">
        {rows.map((row) => {
          const isEditing = editingId === row.id;
          const isPending = pendingTransactionId === row.id;

          return (
            <article
              key={row.id}
              className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4"
            >
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
                    <select
                      value={draft.category_major_user}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          category_major_user: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">미지정</option>
                      {activeCategoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={draft.category_minor_user}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          category_minor_user: event.target.value,
                        }))
                      }
                      placeholder="소분류"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                    <textarea
                      value={draft.memo}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          memo: event.target.value,
                        }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                  <button
                    type="button"
                    disabled={!hasWriteAccess || isPending}
                    onClick={() => void onRestore(row.id)}
                    className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    복원
                  </button>
                ) : isEditing ? (
                  <>
                    <button
                      type="button"
                      disabled={!hasWriteAccess || isPending}
                      onClick={() => void handleSave(row.id)}
                      className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={cancelEditing}
                      className="rounded-full border border-[color:var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--color-text-muted)] transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!hasWriteAccess || isPending}
                      onClick={() => startEditing(row)}
                      className="rounded-full border border-[color:var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--color-text)] transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      disabled={!hasWriteAccess || isPending}
                      onClick={() => void onDelete(row.id)}
                      className="rounded-full bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
