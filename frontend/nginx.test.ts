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

  it('revalidates direct HTML and SPA fallback responses without changing hashed asset caching', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');
    const html = config.match(/location = \/index\.html\s*\{([^}]+)\}/)?.[1];
    const fallback = config.match(/location \/\s*\{([^}]+)\}/)?.[1];
    const assets = config.match(/location \/assets\/\s*\{([^}]+)\}/)?.[1];

    expect(html).toContain('try_files $uri =404;');
    expect(html).toContain('add_header Cache-Control "no-cache" always;');
    expect(fallback).toContain('try_files $uri $uri/ /index.html;');
    expect(config).toContain('index index.html;');
    expect(html).not.toMatch(/expires\s+(?:1y|max)|immutable/);
    expect(assets).toContain('try_files $uri =404;');
    expect(assets).toContain('expires 1y;');
    expect(assets).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(assets).not.toContain('index.html');
    expect(assets).not.toMatch(/no-cache|no-store/);
  });

  it('does not cache startup runtime configuration or fall back to HTML when it is absent', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');
    const runtime = config.match(/location = \/runtime-config\.js\s*\{([^}]+)\}/)?.[1];

    expect(runtime).toContain('add_header Cache-Control "no-store" always;');
    expect(runtime).toContain('try_files $uri =404;');
    expect(runtime).not.toContain('index.html');
  });

  it('retains security headers in locations that override add_header inheritance', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');
    const locations = [
      config.match(/location = \/index\.html\s*\{([^}]+)\}/)?.[1],
      config.match(/location = \/runtime-config\.js\s*\{([^}]+)\}/)?.[1],
    ];

    for (const location of locations) {
      expect(location).toContain('add_header X-Content-Type-Options nosniff always;');
      expect(location).toContain('add_header X-Frame-Options SAMEORIGIN always;');
      expect(location).toContain('add_header Referrer-Policy strict-origin-when-cross-origin always;');
    }
  });

});
