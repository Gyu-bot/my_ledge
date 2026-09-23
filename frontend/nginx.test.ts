import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('frontend nginx config', () => {
  it('proxies api requests to the backend service', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

    expect(config).toContain('location /api/');
    expect(config).toContain('proxy_pass http://backend:8000/api/;');
  });

  it('serves build metadata without caching or the SPA fallback', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');
    const location = config.match(/location = \/build-info\.json\s*\{([^}]+)\}/)?.[1];

    expect(location).toBeDefined();
    expect(location).toContain('default_type application/json;');
    expect(location).toContain('add_header Cache-Control "no-store" always;');
    expect(location).toContain('try_files $uri =404;');
    expect(location).not.toContain('index.html');
  });
});
