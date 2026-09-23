import { writeFileSync } from 'node:fs';

const commit = process.env.SOURCE_COMMIT ?? 'unknown';

if (commit !== 'unknown' && (commit.length !== 40 || !/^[0-9a-f]{40}$/.test(commit))) {
  throw new Error('SOURCE_COMMIT must be a full lowercase 40-character Git SHA or unknown');
}

writeFileSync('dist/build-info.json', `${JSON.stringify({ commit })}\n`);
