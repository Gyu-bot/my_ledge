import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('frontend nginx config', () => {
  it('proxies api requests to the backend service', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

    expect(config).toContain('location /api/');
    expect(config).toContain('proxy_pass http://backend:8000/api/;');
  });
});
