// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtures: string[] = [];

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'frontend-build-trace-'));
  fixtures.push(root);
  for (const folder of ['frontend', 'scripts', 'bin', 'capture']) mkdirSync(resolve(root, folder));
  copyFileSync(resolve(process.cwd(), '../scripts/build-frontend-image.sh'), resolve(root, 'scripts/build-frontend-image.sh'));
  writeFileSync(resolve(root, 'frontend/index.txt'), 'committed source\n');
  writeFileSync(resolve(root, '.gitignore'), 'frontend/.env\n');
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init');
  git('add', 'frontend', 'scripts', '.gitignore');
  git('-c', 'user.name=Build test', '-c', 'user.email=build-test@example.invalid', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  writeFileSync(resolve(root, 'bin/docker'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$TRACE_CAPTURE/args"\ncat > "$TRACE_CAPTURE/context.tar"\n');
  chmodSync(resolve(root, 'bin/docker'), 0o755);
  const run = () => spawnSync('bash', [resolve(root, 'scripts/build-frontend-image.sh'), 'trace-test:latest'], {
    cwd: tmpdir(),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${resolve(root, 'bin')}:${process.env.PATH}`, TRACE_CAPTURE: resolve(root, 'capture') },
  });
  return { root, git, run };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('traceable frontend Docker build helper', () => {
  it('sends the committed frontend archive and full SHA, excluding ignored local inputs', () => {
    const { root, git, run } = fixture();
    writeFileSync(resolve(root, 'frontend/.env'), 'DO_NOT_SHIP=test-only-value\n');
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const args = readFileSync(resolve(root, 'capture/args'), 'utf8').trim().split('\n');
    expect(args).toEqual(['build', '--build-arg', `SOURCE_COMMIT=${git('rev-parse', 'HEAD').trim()}`, '--build-arg', 'VITE_API_KEY', '-t', 'trace-test:latest', '-']);
    const archive = resolve(root, 'capture/context.tar');
    expect(execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim()).toBe('index.txt');
    expect(execFileSync('tar', ['-xOf', archive, 'index.txt'], { encoding: 'utf8' })).toBe('committed source\n');
  });

  it.each(['tracked', 'untracked'])('refuses %s frontend changes before calling Docker', (kind) => {
    const { root, run } = fixture();
    writeFileSync(resolve(root, kind === 'tracked' ? 'frontend/index.txt' : 'frontend/new.txt'), 'uncommitted\n');
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Frontend has uncommitted files');
    expect(existsSync(resolve(root, 'capture/args'))).toBe(false);
  });
});
