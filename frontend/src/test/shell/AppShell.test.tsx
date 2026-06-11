import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AppShell } from '../../shell/AppShell'

function renderShell(initialPath = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <div>홈 컨텐츠</div> },
          { path: 'data/inbox', element: <div>인박스 컨텐츠</div> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  return render(<RouterProvider router={router} />)
}

describe('AppShell', () => {
  it('새 IA 내비게이션을 렌더한다 (최상위 4 + 데이터 9)', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    for (const label of ['홈', '지출', '자산·부채', '신호']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
    for (const label of ['인박스', '거래', '대출', '할부', '자산 메타', '규칙', '설정', '가져오기', '데이터 사전']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
  })

  it('자식 라우트를 본문에 렌더한다', () => {
    renderShell()
    expect(screen.getByText('홈 컨텐츠')).toBeInTheDocument()
  })

  it('API 키가 없으면 읽기 전용 표시를 1곳에 보여준다', () => {
    renderShell()
    expect(screen.getByText('읽기 전용')).toBeInTheDocument()
  })

  it('테마 토글 버튼이 있다 (다크 기본)', () => {
    renderShell()
    expect(screen.getByRole('button', { name: '라이트 테마로 전환' })).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
