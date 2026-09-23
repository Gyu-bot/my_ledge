#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
commit=$(git -C "$repo_root" rev-parse HEAD)
image=${1:-my_ledge-frontend}

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [image-tag]" >&2
  exit 2
fi

if [[ -n $(git -C "$repo_root" status --porcelain --untracked-files=all -- frontend) ]]; then
  echo "Frontend has uncommitted files. Commit them before building a traceable image." >&2
  exit 1
fi

# The immutable Git archive is the build context. Ignored local files (including
# .env), node_modules, and stale dist output cannot enter this image.
# VITE_API_KEY is optional: Docker reads it from the caller's environment without
# putting its value in command arguments. Compose also supplies runtime config.
git -C "$repo_root" archive --format=tar "$commit:frontend" |
  docker build --build-arg "SOURCE_COMMIT=$commit" --build-arg VITE_API_KEY -t "$image" -
