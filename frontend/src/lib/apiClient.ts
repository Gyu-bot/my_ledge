const API_BASE = '/api/v1'

function getApiKey(): string | undefined {
  return (window as unknown as { __RUNTIME_CONFIG__?: { API_KEY?: string } })
    .__RUNTIME_CONFIG__?.API_KEY ?? import.meta.env.VITE_API_KEY
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (apiKey) headers['X-API-Key'] = apiKey

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function hasWriteAccess(): boolean {
  const key = (window as unknown as { __RUNTIME_CONFIG__?: { API_KEY?: string } })
    .__RUNTIME_CONFIG__?.API_KEY ?? import.meta.env.VITE_API_KEY
  return !!key && key.length > 0
}
