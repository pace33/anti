#!/usr/bin/env bash
# ExecStartPost for the canonical anti GitHub sync. Restart only on API changes.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="${AIEDUE_DATA_API_ROOT:-/home/aiedue/migrated-from-pc/에이두 데이터베이스/api}"
NODE="${AIEDUE_DATA_NODE:-/home/aiedue/.local/node24/bin/node}"
if cmp -s "$HERE/korean-notices.mjs" "$API_ROOT/src/korean-notices.mjs" &&
    grep -Fq 'await notices.handle(req, res, actor, sub, url)' "$API_ROOT/src/korean-v2.js"; then
    printf '%s\n' 'notices API unchanged'
    exit 0
fi
"$NODE" --check "$HERE/korean-notices.mjs"
python3 "$HERE/install-korean-notices.py" --api-root "$API_ROOT"
"$NODE" --check "$API_ROOT/src/korean-v2.js"
systemctl --user restart aiedue-database.service
curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:3050/db-api/health
printf '\n%s\n' 'notices API synchronized from canonical main'
