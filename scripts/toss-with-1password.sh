#!/bin/sh
# Resolve references only inside op run; never print or write credential values.
set +x
set -eu

if [ "$#" -eq 0 ]; then
    printf '%s\n' 'Usage: scripts/toss-with-1password.sh COMMAND [ARG ...]' >&2
    exit 2
fi

if ! command -v op >/dev/null 2>&1; then
    printf '%s\n' '1Password CLI (op) is required. Install it and enable desktop app integration.' >&2
    exit 127
fi

if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' 'Python 3 is required to resolve 1Password field references.' >&2
    exit 127
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$script_dir/toss-1password-refs.py" "$@"
