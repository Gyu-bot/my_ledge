import { Card } from '../ds/Card'
import { PageHeader } from '../shell/PageHeader'

interface PlaceholderPageProps {
  title: string
  description: string
  /** 이 화면에 들어올 예정 섹션 (02-ia-redesign.md 기준) */
  planned: string[]
  wireframeRef: string
}

/** 아직 구현되지 않은 IA 목적지의 스텁 — 라우팅/내비 구조를 먼저 고정한다 */
export function PlaceholderPage({ title, description, planned, wireframeRef }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} meta={<span>설계 초안 단계</span>} />
      <Card title="다음 단계에서 구현됩니다" meta={description}>
        <ul className="list-inside list-disc space-y-1 text-label text-text-secondary">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-text-muted">
          설계: <code className="font-mono">{wireframeRef}</code>
        </p>
      </Card>
    </>
  )
}
