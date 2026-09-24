import { useState } from 'react'
import { Card } from '../../ds/Card'
import { Button } from '../../ds/Button'
import { Field, Select } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { EM_DASH, formatNetWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import { useAssetSnapshots, usePatchAssetLiquidity } from '../../hooks/useAssets'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { AssetLiquidityPatchRequest, AssetSnapshotItemResponse, LiquidityTier } from '../../types/asset'

const LIQUIDITY_LABEL: Record<LiquidityTier, string> = {
  immediate: '즉시 사용',
  near_liquid: '단기 현금화',
  illiquid: '비유동',
}

interface AssetDraft {
  liquidity_tier: LiquidityTier | ''
  is_cash_equivalent: 'automatic' | 'include' | 'exclude'
}

function storedAssetDraft(asset: AssetSnapshotItemResponse): AssetDraft {
  return { liquidity_tier: asset.liquidity_tier ?? '', is_cash_equivalent: asset.is_cash_equivalent == null ? 'automatic' : asset.is_cash_equivalent ? 'include' : 'exclude' }
}

function changedAssetDraft(asset: AssetSnapshotItemResponse, edits: Partial<AssetDraft> = {}): Partial<AssetDraft> {
  const stored = storedAssetDraft(asset)
  const changed = { ...edits }
  if (changed.liquidity_tier === stored.liquidity_tier) delete changed.liquidity_tier
  if (changed.is_cash_equivalent === stored.is_cash_equivalent) delete changed.is_cash_equivalent
  return changed
}

export function AssetMetaPage() {
  const hasWrite = useWriteAccess()
  const snapshots = useAssetSnapshots()
  const patch = usePatchAssetLiquidity()
  const [drafts, setDrafts] = useState<Record<number, Partial<AssetDraft>>>({})

  const latest = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const snapshotDate = latest?.snapshot_date ?? null
  const assetRows = (snapshots.data?.asset_items ?? [])
    .filter((item) => item.side === 'asset' && (!snapshotDate || item.snapshot_date === snapshotDate))
    // 미지정 자산 우선 정렬
    .sort((a, b) => Number(!!a.liquidity_tier) - Number(!!b.liquidity_tier))

  function editDraft(asset: AssetSnapshotItemResponse, values: Partial<AssetDraft>) {
    setDrafts((current) => {
      const changed = changedAssetDraft(asset, { ...current[asset.id], ...values })
      const next = { ...current }
      if (Object.keys(changed).length > 0) next[asset.id] = changed
      else delete next[asset.id]
      return next
    })
  }

  async function save(asset: AssetSnapshotItemResponse) {
    const draft = changedAssetDraft(asset, drafts[asset.id])
    if (Object.keys(draft).length === 0) return
    const data: AssetLiquidityPatchRequest = {}
    if ('liquidity_tier' in draft) data.liquidity_tier = draft.liquidity_tier || null
    if ('is_cash_equivalent' in draft) data.is_cash_equivalent = draft.is_cash_equivalent === 'automatic' ? null : draft.is_cash_equivalent === 'include'
    try {
      await patch.mutateAsync({
        id: asset.id,
        data,
      })
      setDrafts((current) => { const next = { ...current }; delete next[asset.id]; return next })
      toast.success('자산 유동성 저장 완료', { description: asset.product_name || asset.category })
    } catch (error) {
      toast.error('저장 실패', { description: String(error) })
    }
  }

  return (
    <>
      <PageHeader
        title="데이터 · 자산 메타"
        meta={snapshotDate ? <span className="tnum rounded-sm border border-border bg-bg-inset px-2 py-0.5">기준일 {snapshotDate}</span> : undefined}
      />

      <Card title="자산 유동성 설정" meta={`${assetRows.length}개 자산 · 최신 스냅샷 기준`}>
        {snapshots.isLoading ? <ListSkeleton rows={5} /> :
         snapshots.error ? <ErrorState onRetry={() => void snapshots.refetch()} /> :
         assetRows.length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {assetRows.map((asset) => {
              const changes = changedAssetDraft(asset, drafts[asset.id])
              const draft = { ...storedAssetDraft(asset), ...changes }
              return (
                <div key={asset.id} className="flex flex-wrap items-end gap-3 py-3 first:pt-0">
                  <div className="min-w-44 flex-1">
                    <div className="flex items-center gap-1.5 text-label text-text-primary">
                      {asset.product_name || asset.category || `자산 ${asset.id}`}
                      {!asset.liquidity_tier ? <span className="text-micro text-warn">미지정 ⚠</span> : null}
                    </div>
                    <div className="tnum text-caption text-text-muted">
                      {[asset.category, asset.amount ? formatNetWon(parseFloat(asset.amount)) : null].filter(Boolean).join(' · ') || EM_DASH}
                    </div>
                  </div>
                  <Field label="유동성 등급">
                    <Select
                      aria-label={`${asset.product_name} 유동성 등급`}
                      disabled={!hasWrite || patch.isPending}
                      value={draft.liquidity_tier}
                      onChange={(event) => editDraft(asset, { liquidity_tier: event.target.value as LiquidityTier | '' })}
                    >
                      <option value="">미지정</option>
                      {(Object.entries(LIQUIDITY_LABEL) as [LiquidityTier, string][]).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="현금성" hint="자동은 자산 종류와 이름으로 추정합니다">
                    <Select aria-label={`${asset.product_name} 현금성`} disabled={!hasWrite || patch.isPending} value={draft.is_cash_equivalent}
                      onChange={(event) => editDraft(asset, { is_cash_equivalent: event.target.value as AssetDraft['is_cash_equivalent'] })}>
                      <option value="automatic">자동 추정</option>
                      <option value="include">포함</option>
                      <option value="exclude">제외</option>
                    </Select>
                  </Field>
                  <Button variant="primary" disabled={!hasWrite || patch.isPending || Object.keys(changes).length === 0} onClick={() => void save(asset)}>저장</Button>
                </div>
              )
            })}
          </div>
        ) : <EmptyState message="최신 자산 설정 대상이 없습니다" actionLabel="가져오기" actionTo="/data/import" />}
      </Card>
    </>
  )
}
