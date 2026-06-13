import { useEffect, useState } from 'react'
import { Card } from '../../ds/Card'
import { Button } from '../../ds/Button'
import { Field, Select, Toggle } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { EM_DASH, formatWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import { useAssetSnapshots, usePatchAssetLiquidity } from '../../hooks/useAssets'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { AssetSnapshotItemResponse, LiquidityTier } from '../../types/asset'

const LIQUIDITY_LABEL: Record<LiquidityTier, string> = {
  immediate: '즉시 사용',
  near_liquid: '단기 현금화',
  illiquid: '비유동',
}

interface AssetDraft {
  liquidity_tier: LiquidityTier | ''
  is_cash_equivalent: boolean
}

export function AssetMetaPage() {
  const hasWrite = useWriteAccess()
  const snapshots = useAssetSnapshots()
  const patch = usePatchAssetLiquidity()
  const [drafts, setDrafts] = useState<Record<number, AssetDraft>>({})

  const latest = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const snapshotDate = latest?.snapshot_date ?? null
  const assetRows = (snapshots.data?.asset_items ?? [])
    .filter((item) => item.side === 'asset' && (!snapshotDate || item.snapshot_date === snapshotDate))
    // 미지정 자산 우선 정렬
    .sort((a, b) => Number(!!a.liquidity_tier) - Number(!!b.liquidity_tier))

  useEffect(() => {
    if (assetRows.length === 0) return
    setDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const asset of assetRows) {
        if (!next[asset.id]) {
          next[asset.id] = { liquidity_tier: asset.liquidity_tier ?? '', is_cash_equivalent: !!asset.is_cash_equivalent }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [assetRows])

  async function save(asset: AssetSnapshotItemResponse) {
    const draft = drafts[asset.id]
    if (!draft) return
    try {
      await patch.mutateAsync({
        id: asset.id,
        data: { liquidity_tier: draft.liquidity_tier || null, is_cash_equivalent: draft.is_cash_equivalent },
      })
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
              const draft = drafts[asset.id] ?? { liquidity_tier: '', is_cash_equivalent: false }
              return (
                <div key={asset.id} className="flex flex-wrap items-end gap-3 py-3 first:pt-0">
                  <div className="min-w-44 flex-1">
                    <div className="flex items-center gap-1.5 text-label text-text-primary">
                      {asset.product_name || asset.category || `자산 ${asset.id}`}
                      {!asset.liquidity_tier ? <span className="text-micro text-warn">미지정 ⚠</span> : null}
                    </div>
                    <div className="tnum text-caption text-text-muted">
                      {[asset.category, asset.amount ? `₩${formatWon(parseFloat(asset.amount))}` : null].filter(Boolean).join(' · ') || EM_DASH}
                    </div>
                  </div>
                  <Field label="유동성 등급">
                    <Select
                      aria-label={`${asset.product_name} 유동성 등급`}
                      disabled={!hasWrite || patch.isPending}
                      value={draft.liquidity_tier}
                      onChange={(event) => setDrafts((current) => ({ ...current, [asset.id]: { ...draft, liquidity_tier: event.target.value as LiquidityTier | '' } }))}
                    >
                      <option value="">미지정</option>
                      {(Object.entries(LIQUIDITY_LABEL) as [LiquidityTier, string][]).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Toggle
                    className="pb-1.5"
                    label="현금성"
                    disabled={!hasWrite || patch.isPending}
                    checked={draft.is_cash_equivalent}
                    onChange={(checked) => setDrafts((current) => ({ ...current, [asset.id]: { ...draft, is_cash_equivalent: checked } }))}
                  />
                  <Button variant="primary" disabled={!hasWrite || patch.isPending} onClick={() => void save(asset)}>저장</Button>
                </div>
              )
            })}
          </div>
        ) : <EmptyState message="최신 자산 설정 대상이 없습니다" actionLabel="가져오기" actionTo="/data/import" />}
      </Card>
    </>
  )
}
