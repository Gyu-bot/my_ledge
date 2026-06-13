import { apiFetch } from '../lib/apiClient'
import type { ProfileResponse } from '../types/profile'

export const profileApi = {
  get: () => apiFetch<ProfileResponse>('/profile'),
}
