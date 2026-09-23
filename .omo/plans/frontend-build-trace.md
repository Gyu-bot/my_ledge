# Frontend build commit tracing

Status: completed
Scope authorization: 2026-09-23 user request to inspect the live frontend and, if needed, implement and commit tracking. This plan records that bounded request; it does not authorize live deployment or merging.

## Problem and scope

The deployed frontend contains only compiled assets and has no commit metadata. A server checkout SHA alone cannot identify those assets. Add a small build metadata file and matching image label, plus a build helper that supplies a committed Git archive as the Docker context.

No application UI, API, database, live service, or host configuration changes. Do not include runtime configuration, credentials, or user data in metadata or evidence.

## Acceptance and execution

- [x] Compare current live assets to a build of current main; record the limits of the comparison.
- [x] Generate `build-info.json` with a validated full Git SHA or explicit `unknown`.
- [x] Set the same SHA on the final image's OCI revision label.
- [x] Serve metadata as JSON with no-store; missing metadata must return 404 rather than the SPA shell.
- [x] Provide a helper that builds a clean frontend from `git archive`, avoiding ignored/untracked build inputs and false attribution to HEAD.
- [x] Document build and read-only verification commands and the limitations of manually supplied SHA arguments.
- [x] Run focused tests, frontend lint/typecheck/build, a Docker smoke if available, and a read-only browser check.
- [x] Review the scoped diff for the `codex/frontend-build-trace` commit; no merge or deployment is included.

## Evidence

See [verification evidence](../evidence/frontend-build-trace.md). Live connection details remain only in local memory; this document contains no host-specific access information. Commit SHA of this implementation is supplied by Git history rather than a self-referential value in this file.
