import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const rootEnvDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, rootEnvDir, '');
  const apiProxyTarget =
    rootEnv.VITE_PROXY_TARGET ?? process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000';
  const clientApiKey =
    rootEnv.VITE_API_KEY ??
    rootEnv.API_KEY ??
    process.env.VITE_API_KEY ??
    process.env.API_KEY ??
    '';

  return {
    envDir: rootEnvDir,
    define: {
      'import.meta.env.VITE_API_KEY': JSON.stringify(clientApiKey),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: process.env.VITE_HOST ?? '0.0.0.0',
      allowedHosts: ['localhost', '127.0.0.1', '.tailbe7385.ts.net', '.ts.net'],
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
    },
  };
});
