import { hasWriteAccess } from '../lib/apiClient'

export function useWriteAccess(): boolean {
  return hasWriteAccess()
}
