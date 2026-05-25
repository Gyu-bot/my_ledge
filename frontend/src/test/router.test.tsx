import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { routes } from '../router'

function findRoute(path: string) {
  return routes.find((route) => route.path === path)
}

describe('legacy route fallbacks', () => {
  it('defines an explicit /income redirect to overview', () => {
    const route = findRoute('/income')

    expect(route).toBeDefined()
    expect(isValidElement(route?.element)).toBe(true)
    expect((route?.element as { props?: { to?: string } }).props?.to).toBe('/')
  })

  it('defines an explicit /transfers redirect to overview', () => {
    const route = findRoute('/transfers')

    expect(route).toBeDefined()
    expect(isValidElement(route?.element)).toBe(true)
    expect((route?.element as { props?: { to?: string } }).props?.to).toBe('/')
  })
})

describe('operations routes', () => {
  it('registers the recurring classification operations route', () => {
    const root = findRoute('/')
    const children = root?.children as Array<{ path?: string }> | undefined

    expect(children?.some((route) => route.path === 'operations/recurring-classification')).toBe(true)
  })

  it('registers the auto classification operations route', () => {
    const root = findRoute('/')
    const children = root?.children as Array<{ path?: string }> | undefined

    expect(children?.some((route) => route.path === 'operations/auto-classification')).toBe(true)
  })
})
