import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWriteAccess } from '../../hooks/useWriteAccess'

describe('useWriteAccess', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_KEY', '')
  })

  it('returns false when no API key', () => {
    const { result } = renderHook(() => useWriteAccess())
    expect(result.current).toBe(false)
  })

  it('returns true when VITE_API_KEY is set', () => {
    vi.stubEnv('VITE_API_KEY', 'test-key')
    const { result } = renderHook(() => useWriteAccess())
    expect(result.current).toBe(true)
  })
})
