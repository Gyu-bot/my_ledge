import { useState } from 'react'
import { Button } from '../../ds/Button'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { useSyncTossIntegration, useTossIntegrationStatus } from '../../hooks/useTossIntegration'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import { sourceTime, syncStatus } from '../assets/sourcePresentation'

const ERROR_MESSAGES: Record<string, string> = {
  credentials_not_configured: '백엔드에 토스증권 API 키를 설정해 주세요.',
  sync_in_progress: '이미 토스 자산을 조회하고 있습니다. 잠시 후 다시 확인해 주세요.',
  sync_cooldown: '요청 간격을 두고 다시 조회해 주세요.',
  authentication_failed: '토스증권 API 인증에 실패했습니다. 서버의 키 설정을 확인해 주세요.',
  access_denied: '토스증권 API 접근이 거절됐습니다. 허용 IP와 권한을 확인해 주세요.',
  rate_limited: '토스증권 API 요청 한도에 도달했습니다. 잠시 후 다시 조회해 주세요.',
  network_error: '토스증권 API에 연결하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.',
  network_timeout: '토스증권 API 응답이 지연됐습니다. 잠시 후 다시 조회해 주세요.',
  provider_error: '토스증권 API에서 오류가 발생했습니다. 잠시 후 다시 조회해 주세요.',
  invalid_response: '토스증권 응답 형식을 확인할 수 없어 수집을 완료하지 못했습니다.',
  single_account_required: '단일 계좌 연결은 토스 계좌가 하나일 때만 가능합니다.',
  unsupported_account: '현재 지원하지 않는 계좌 유형입니다.',
  unsupported_holdings_scope: '뱅샐 투자 그룹에 조회 범위 밖의 자산이 있어 토스 API로 대체할 수 없습니다. 국내·미국 주식(ETF 포함)만 있는지 확인해 주세요.',
  invalid_fx_response: '원화 환산에 필요한 환율을 확인하지 못했습니다.',
  incomplete_holdings: '일부 보유 항목을 확인하지 못해 수집을 완료하지 못했습니다.',
  banksalad_toss_group_required: '뱅샐의 토스증권 투자 그룹이 필요합니다. 뱅샐 데이터를 먼저 업로드해 주세요.',
  account_mapping_conflict: '기존 계좌 연결과 충돌하여 연결하지 않았습니다. 연결 설정을 확인해 주세요.',
  account_mapping_required: '조회는 완료됐지만 뱅샐 계좌 그룹과의 연결 확인이 필요합니다.',
  account_mapping_ambiguous: '계좌 연결 범위가 불분명하여 연결하지 않았습니다.',
}

function errorMessage(code: string | null) {
  return (code && ERROR_MESSAGES[code]) || '토스 보유자산을 완전히 조회하지 못했습니다. 서버 설정을 확인하거나 잠시 후 다시 시도해 주세요.'
}

function requestErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const code = Object.keys(ERROR_MESSAGES).find((candidate) => error.message.includes(`"${candidate}"`))
    if (code) return ERROR_MESSAGES[code]
  }
  return errorMessage(null)
}

interface Props {
  disabled: boolean
  onSyncStateChange: (pending: boolean) => void
}

export function TossIntegrationPanel({ disabled, onSyncStateChange }: Props) {
  const hasWrite = useWriteAccess()
  const status = useTossIntegrationStatus()
  const sync = useSyncTossIntegration()
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const unavailable = disabled || !hasWrite || sync.isPending || !status.data?.configured || !!status.error || (status.data.cooldown_seconds > 0)

  async function refresh() {
    if (unavailable) return
    setMessage(null)
    onSyncStateChange(true)
    try {
      const result = await sync.mutateAsync({ confirm_single_account_mapping: !status.data?.mapping_connected && confirmed })
      if (result.status === 'success_complete') {
        setMessage(`토스 보유자산 ${result.holdings_count}건을 조회했습니다. ${result.mapping_connected ? '계좌 연결이 확인됐습니다. 소스 변경은 아래에서 미리보기 후 적용해 주세요.' : '계좌 연결은 아직 확인되지 않아 합산에서 제외됩니다.'}${result.error_code ? ` ${errorMessage(result.error_code)}` : ''}`)
      } else {
        setMessage(`${syncStatus(result.status)} · ${errorMessage(result.error_code)} 마지막 완전한 정상 수집 결과를 유지합니다.`)
      }
    } catch (error) {
      setMessage(requestErrorMessage(error))
    } finally {
      onSyncStateChange(false)
    }
  }

  return (
    <section aria-label="토스증권 API 연결" className="mb-5 space-y-3 rounded-md border border-border p-4">
      <h3 className="text-label font-semibold">토스증권 API 연결</h3>
      <p className="text-caption text-text-muted">API 키는 백엔드에서만 사용합니다. 국내·미국 주식(ETF 포함)만 조회하며 채권·옵션·예수금은 포함하지 않습니다. USD 원화 환산에는 별도로 조회한 환율을 사용합니다.</p>
      <p className="text-caption text-text-muted">토스가 평가 시각을 제공하지 않아 조회 시각 기준 추정으로 표시합니다. 조회와 소스 선택 적용은 별개입니다.</p>
      {status.isLoading ? <ListSkeleton rows={2} /> : status.error || !status.data ? <ErrorState message="토스 연결 상태를 불러오지 못했습니다" onRetry={() => void status.refetch()} /> : <>
        <p className="text-caption">서버 API 키 {status.data.configured ? '설정됨' : '미설정'} · 계좌 연결 {status.data.mapping_connected ? '확인됨' : '미확인'}</p>
        {!status.data.configured && <p className="text-caption text-warn">백엔드에 토스증권 API 키를 설정한 후 새로고침해 주세요.</p>}
        {status.data.last_attempt && <div className="space-y-1 text-caption text-text-muted">
          <p>최근 조회 {syncStatus(status.data.last_attempt.status)} · 조회 시각 {sourceTime(status.data.last_attempt.observed_at)}</p>
          <p>수집 시각 {sourceTime(status.data.last_attempt.ingested_at)}</p>
          {status.data.last_attempt.error_code && <p className="text-warn">{errorMessage(status.data.last_attempt.error_code)}</p>}
        </div>}
        {!status.data.mapping_connected && <div className="space-y-1">
          <label className="flex items-start gap-2 text-caption">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ds-accent-fg)]" checked={confirmed} disabled={unavailable} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>내 토스 계좌는 하나이며, 뱅샐의 토스증권 투자 그룹과 같은 계좌이고 이 그룹에는 국내·미국 주식(ETF 포함)만 있습니다</span>
          </label>
          <p className="text-caption text-text-muted">확인하지 않아도 조회할 수 있습니다. 연결이 확인되지 않은 외부 계좌는 합산에서 제외됩니다.</p>
        </div>}
        <Button disabled={unavailable} onClick={() => void refresh()}>{sync.isPending ? '토스 보유자산 조회 중…' : '토스 보유자산 새로고침'}</Button>
        {status.data.cooldown_seconds > 0 && <p className="text-caption text-text-muted">다음 조회까지 {status.data.cooldown_seconds}초 남았습니다.</p>}
      </>}
      {message && <p role="status" className="text-caption text-text-secondary">{message}</p>}
    </section>
  )
}
