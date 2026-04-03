export class ApiError extends Error {
  readonly status: number;

  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue>;

type JsonBody = object;

type ClientEnvKey =
  | 'VITE_API_KEY'
  | 'API_KEY'
  | 'VITE_API_BASE_URL'
  | 'API_BASE_URL';

type ClientEnv = Partial<Record<ClientEnvKey, string | undefined>>;

export interface RuntimeClientConfig {
  apiKey?: string;
  apiBaseUrl?: string;
}

declare global {
  interface Window {
    __MY_LEDGE_RUNTIME_CONFIG__?: RuntimeClientConfig;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  readonly body?: BodyInit | JsonBody | null;
  readonly query?: QueryParams;
}

function normalizeConfigValue(value: string | undefined) {
  if (!value) {
    return '';
  }

  return value.trim();
}

function getClientEnv(): ClientEnv {
  return import.meta.env as ClientEnv;
}

export function getRuntimeClientConfig(win: Window = window): RuntimeClientConfig {
  return win.__MY_LEDGE_RUNTIME_CONFIG__ ?? {};
}

export function resolveClientApiKey(env: ClientEnv, runtimeConfig: RuntimeClientConfig = {}) {
  return (
    normalizeConfigValue(runtimeConfig.apiKey) ||
    normalizeConfigValue(env.VITE_API_KEY) ||
    normalizeConfigValue(env.API_KEY)
  );
}

export function resolveClientApiBaseUrl(
  env: ClientEnv,
  runtimeConfig: RuntimeClientConfig = {},
) {
  return (
    normalizeConfigValue(runtimeConfig.apiBaseUrl) ||
    normalizeConfigValue(env.VITE_API_BASE_URL) ||
    normalizeConfigValue(env.API_BASE_URL) ||
    '/api/v1'
  );
}

function getResolvedClientApiKey() {
  return resolveClientApiKey(getClientEnv(), getRuntimeClientConfig());
}

function getResolvedClientApiBaseUrl() {
  return resolveClientApiBaseUrl(getClientEnv(), getRuntimeClientConfig());
}

function buildUrl(path: string, query?: QueryParams) {
  const baseUrl = path.startsWith('http') ? path : `${getResolvedClientApiBaseUrl()}${path}`;
  const url = new URL(baseUrl, window.location.origin);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function isJsonBody(body: ApiRequestOptions['body']): body is JsonBody {
  return body !== null && body !== undefined && !(body instanceof FormData) && typeof body === 'object';
}

export function getApiKeyHeaders(): Record<string, string> {
  const apiKey = getResolvedClientApiKey();
  return apiKey ? { 'X-API-Key': apiKey } : {};
}

export function hasApiKeyConfigured() {
  return Boolean(getResolvedClientApiKey());
}

function extractErrorMessage(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  if ('detail' in body && typeof body.detail === 'string') {
    return body.detail;
  }

  if ('error_message' in body && typeof body.error_message === 'string') {
    return body.error_message;
  }

  if ('message' in body && typeof body.message === 'string') {
    return body.message;
  }

  return null;
}

function buildApiErrorMessage(status: number, body: unknown) {
  const detail = typeof body === 'string' ? body : extractErrorMessage(body);

  if (status === 401 || status === 403) {
    return detail
      ? `API 인증에 실패했습니다. frontend runtime API_KEY와 backend API_KEY가 일치하는지 확인하세요. (${detail})`
      : 'API 인증에 실패했습니다. frontend runtime API_KEY와 backend API_KEY가 일치하는지 확인하세요.';
  }

  return detail
    ? `API request failed with status ${status}: ${detail}`
    : `API request failed with status ${status}`;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, query, ...init } = options;
  let serializedBody: BodyInit | undefined;

  if (isJsonBody(body)) {
    serializedBody = JSON.stringify(body);
  } else if (body !== null && body !== undefined) {
    serializedBody = body;
  }

  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(isJsonBody(body) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: serializedBody,
  });

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new ApiError(
      buildApiErrorMessage(response.status, responseBody),
      response.status,
      responseBody,
    );
  }

  return responseBody as T;
}
