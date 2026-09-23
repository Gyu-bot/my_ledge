import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), 'scripts/write-build-info.mjs');
const workspaces: string[] = [];

function runScript(commit?: string) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'my-ledge-build-info-'));
  workspaces.push(cwd);
  mkdirSync(resolve(cwd, 'dist'));
  const result = spawnSync(process.execPath, [script], {
    cwd,
    env: commit === undefined ? {} : { SOURCE_COMMIT: commit },
    encoding: 'utf8',
  });
  return { result, output: resolve(cwd, 'dist/build-info.json') };
}

afterEach(() => {
  for (const cwd of workspaces.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

describe('frontend build metadata', () => {
  it.each([undefined, 'unknown', '0123456789abcdef0123456789abcdef01234567'])(
    'writes only the supplied commit or unknown to the served JSON path (%s)',
    (commit) => {
      const { result, output } = runScript(commit);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ commit: commit ?? 'unknown' });
    },
  );

  it.each(['', 'eedf5fb', 'A'.repeat(40), 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(40) + '\n', '","secret":"value'])(
    'rejects invalid metadata without writing a JSON file (%s)',
    (commit) => {
      const { result, output } = runScript(commit);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('SOURCE_COMMIT must be');
      expect(existsSync(output)).toBe(false);
    },
  );
});
