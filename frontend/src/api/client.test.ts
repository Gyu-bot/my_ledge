import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, resolveClientApiKey } from './client';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to API_KEY when VITE_API_KEY is absent', () => {
    expect(
      resolveClientApiKey({
        VITE_API_KEY: '',
        API_KEY: 'replace-me',
      }),
    ).toBe('replace-me');
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
});
