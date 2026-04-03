#!/bin/sh
set -eu

escape_js_single_quote() {
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
}

api_key=$(escape_js_single_quote "${API_KEY:-}")
api_base_url=$(escape_js_single_quote "${API_BASE_URL:-/api/v1}")

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__MY_LEDGE_RUNTIME_CONFIG__ = {
  apiKey: '${api_key}',
  apiBaseUrl: '${api_base_url}'
};
EOF
