import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  getRuntimeClientConfig,
  resolveClientApiBaseUrl,
  resolveClientApiKey,
} from './client';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__MY_LEDGE_RUNTIME_CONFIG__;
  });

  it('falls back to API_KEY when VITE_API_KEY is absent', () => {
    expect(
      resolveClientApiKey({
        VITE_API_KEY: '',
        API_KEY: 'replace-me',
      }),
    ).toBe('replace-me');
  });

  it('prefers runtime config over build-time env for API key resolution', () => {
    expect(
      resolveClientApiKey(
        {
          VITE_API_KEY: 'build-key',
          API_KEY: 'env-key',
        },
        {
          apiKey: 'runtime-key',
        },
      ),
    ).toBe('runtime-key');
  });

  it('prefers runtime config over build-time env for API base url resolution', () => {
    expect(
      resolveClientApiBaseUrl(
        {
          VITE_API_BASE_URL: '/api/v1',
        },
        {
          apiBaseUrl: 'https://runtime.example.com/api/v1',
        },
      ),
    ).toBe('https://runtime.example.com/api/v1');
  });

  it('reads runtime config from window when available', () => {
    window.__MY_LEDGE_RUNTIME_CONFIG__ = {
      apiKey: 'runtime-window-key',
      apiBaseUrl: '/runtime-api',
    };

    expect(getRuntimeClientConfig()).toEqual({
      apiKey: 'runtime-window-key',
      apiBaseUrl: '/runtime-api',
    });
  });

  it('returns undefined for 204 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<void>('/transactions/1', {
      method: 'DELETE',
    });

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/transactions/1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('surfaces backend error detail for forbidden responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: 'Invalid API key',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiRequest('/upload', {
        method: 'POST',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'API 인증에 실패했습니다. frontend runtime API_KEY와 backend API_KEY가 일치하는지 확인하세요. (Invalid API key)',
        status: 403,
        body: {
          detail: 'Invalid API key',
        },
      }),
    );
  });
});
