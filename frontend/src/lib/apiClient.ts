interface RuntimeConfig {
  apiKey?: string
  apiBaseUrl?: string
}

function getRuntimeConfig(): RuntimeConfig | undefined {
  return (window as Window & {
    __MY_LEDGE_RUNTIME_CONFIG__?: RuntimeConfig
  }).__MY_LEDGE_RUNTIME_CONFIG__ ?? undefined
}

function getApiBase(): string {
  return getRuntimeConfig()?.apiBaseUrl ?? '/api/v1'
}

function getApiKey(): string | undefined {
  const runtimeConfig = getRuntimeConfig()
  return runtimeConfig?.apiKey ?? import.meta.env.VITE_API_KEY
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey()
  const headers = new Headers(options.headers)
  if (apiKey) headers.set('X-API-Key', apiKey)

  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function hasWriteAccess(): boolean {
  const key = getApiKey()
  return !!key && key.length > 0
}
