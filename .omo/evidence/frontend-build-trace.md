# Frontend build tracing verification

Date: 2026-09-23
Source baseline: `eedf5fb3f888dbae18965d21741ba68c6dd4fb91`
Implementation branch: `codex/frontend-build-trace`

## Existing live frontend

- Read-only browser check: `/data/settings` renders the financial targets and analytics editor introduced by PR #20. No save, upload, or write action was invoked.
- Existing image has no OCI revision label or static build metadata. `/build-info.json` returned the SPA HTML, so HTTP 200 alone did not prove metadata availability.
- Baseline production build JavaScript: `assets/index-CNg-_Nev.js`, SHA-256 `8a0e7c2b8368a7b347eda62a96d7f9df3af1a7d4847bfc070b82f0661de1ad15`.
- Live JavaScript: `assets/index-Xdu-NjlX.js`, SHA-256 `031c53b48ce2ea2599cb32600a90ba95f3a9e15204e2b8ae323ea65d048ba7e0`.
- The live JavaScript contained the injected runtime API key exactly once. Removing that value in remote process memory produced the identical baseline JavaScript hash. No key or bundle contents were printed or retained as evidence.
- CSS `assets/index-DBxneHl9.css` and `brand-mark.png` match byte-for-byte. HTML matches after substituting the differing JavaScript asset filename. This verifies application bundle equivalence to the baseline apart from the injected setting, but does not reconstruct an original image commit label or certify build-toolchain provenance.

## Implementation checks

- `npm test`: 23 files, 122 tests passed. New tests exercise real metadata generator processes and a temporary Git repository with a captured Docker archive; dirty tracked/untracked frontend inputs are rejected and ignored local inputs are absent from the archive.
- `npm run lint`, `npm run typecheck`, `npm run build`, `bash -n scripts/build-frontend-image.sh`, `git diff --check`: passed.
- Docker build with `SOURCE_COMMIT=unknown`: passed; final image revision label is `unknown` and generated JSON is `{"commit":"unknown"}`.
- Actual nginx smoke in a disposable local container with no external network or published ports: syntax valid, metadata HTTP 200, `Content-Type: application/json`, `Cache-Control: no-store`; removing only the test container's metadata returns HTTP 404.
- `docker compose config --services` works with `SOURCE_COMMIT` unset.
- Independent read-only code review found no actionable correctness/security issue in this scoped change.

## Boundaries and existing warnings

- No live images, containers, deployment checkout, database, or settings were modified. Deployment of this new tracing feature remains a separate action; the existing live image will not gain metadata retroactively.
- Existing build warnings remain: outdated Browserslist data and large JavaScript chunk. `npm ci` also reported 18 dependency audit findings; dependency remediation was not part of this scoped change. Docker's existing API-key ARG/ENV warnings are unchanged.
- Local validation used synthetic/missing metadata and no production secrets. The traceable helper supplies a full SHA from its committed source archive; directly supplied `SOURCE_COMMIT` values are caller assertions as documented in README.
