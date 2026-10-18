import { describe, expect, it } from 'vitest'
import { snapshotDateFromFilename } from '../../features/data/uploadFilename'

describe('snapshotDateFromFilename', () => {
  it.each([
    ['2025-10-17~2026-10-17.xlsx', '2026-10-17'],
    ['강민규님_2025-10-17~2026-10-17.xlsx', '2026-10-17'],
    ['banksalad-2026-09-23-1a0ce59df0c6bad4-ee2cd3b4cee76cfa.xlsx', '2026-09-23'],
    ['export_20260822.xlsx', '2026-08-22'],
  ])('%s → %s', (filename, expected) => {
    expect(snapshotDateFromFilename(filename)).toBe(expected)
  })

  it.each([
    'finance.xlsx',
    '2026-10-17~2025-10-17.xlsx',
    '2025-10-17_2026-10-17.xlsx',
    '2026-02-30.xlsx',
    '2024-01-01~2025-01-01~2026-01-01.xlsx',
  ])('ambiguous or invalid name %s is left for manual entry', (filename) => {
    expect(snapshotDateFromFilename(filename)).toBeNull()
  })
})
