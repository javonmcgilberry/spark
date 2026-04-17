#!/usr/bin/env bash
# Expose the local Spark bot (http://localhost:8787 by default) via a
# Cloudflare Tunnel so Webflow Cloud can reach it for demo.
#
# Usage:
#   ./scripts/tunnel.sh             # uses :8787
#   ./scripts/tunnel.sh 8080        # uses :8080
#
# The script prints the public hostname on a single line prefixed with
# `SPARK_TUNNEL_URL=` so callers can parse it.

set -euo pipefail

PORT="${1:-8787}"

if ! command -v cloudflared >/dev/null 2>&1; then
  cat <<EOF >&2
cloudflared is not installed. Install it first:
  macOS:       brew install cloudflared
  Linux:       https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  Windows:     choco install cloudflared
EOF
  exit 127
fi

URL_FILE="$(mktemp)"
cleanup() {
  rm -f "$URL_FILE"
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting cloudflared tunnel to http://localhost:${PORT} ..." >&2

cloudflared tunnel --url "http://localhost:${PORT}" 2>&1 \
  | tee "$URL_FILE" \
  | (
      while IFS= read -r line; do
        echo "$line"
        if [[ "$line" == *"trycloudflare.com"* ]]; then
          url=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
          if [[ -n "$url" ]]; then
            echo "SPARK_TUNNEL_URL=$url"
            echo ""
            echo "Configure Webflow Cloud env:"
            echo "  SPARK_API_BASE_URL=$url"
          fi
        fi
      done
    ) &

TUNNEL_PID=$!
wait "$TUNNEL_PID"
