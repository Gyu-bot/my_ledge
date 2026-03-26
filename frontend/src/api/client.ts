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

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  readonly body?: BodyInit | JsonBody | null;
  readonly query?: QueryParams;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const API_KEY = import.meta.env.VITE_API_KEY;

function buildUrl(path: string, query?: QueryParams) {
  const baseUrl = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
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
  return API_KEY ? { 'X-API-Key': API_KEY } : {};
}

export function hasApiKeyConfigured() {
  return Boolean(API_KEY);
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
    throw new ApiError(`API request failed with status ${response.status}`, response.status, responseBody);
  }

  return responseBody as T;
}
