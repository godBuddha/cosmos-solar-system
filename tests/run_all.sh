#!/usr/bin/env bash
# G2 — chạy toàn bộ test suite local (CI chạy tương tự qua .github/workflows/ci.yml)
# Dùng: bash tests/run_all.sh [--no-docker]
set -u
cd "$(dirname "$0")/.."
rc=0

echo "=== 1/4 catalog (python) ==="
python3 tests/test_catalog.py || rc=1

echo "=== 2/4 api smoke (node) ==="
[ -d server/node_modules ] || (cd server && npm ci --omit=dev --no-audit --no-fund)
node tests/test_api_smoke.mjs || rc=1

echo "=== 3/4 speed presets + G3 (node) ==="
node tests/test_speed_presets.mjs || rc=1
node tests/test_g3.mjs || rc=1

echo "=== 4/4 nginx -t (docker) ==="
if [ "${1:-}" = "--no-docker" ]; then
  echo "bỏ qua (—no-docker)"
else
  # --add-host api:... : nginx resolve upstream "api" lúc parse config —
  # khi test đứng một mình không có container api cùng network
  docker build -q -t cosmos-web-test . && docker run --rm --add-host api:127.0.0.1 cosmos-web-test nginx -t || rc=1
fi

echo
[ $rc -eq 0 ] && echo "✅ TẤT CẢ PASS" || echo "❌ CÓ BÀI FAIL"
exit $rc
