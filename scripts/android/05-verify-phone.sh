#!/data/data/com.termux/files/usr/bin/bash
# Phase 1 — verify FinanceOS responds on the phone (run ON THE PHONE or via adb shell).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

BASE="${1:-http://127.0.0.1:$PHONE_PORT}"
FAIL=0

check() {
  local name="$1"
  local ok="$2"
  local detail="${3:-}"
  if [[ "$ok" == "1" ]]; then
    echo "  PASS  $name"
    [[ -n "$detail" ]] && echo "        $detail"
  else
    echo "  FAIL  $name"
    [[ -n "$detail" ]] && echo "        $detail"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "FinanceOS phone verification: $BASE"
echo ""

if curl -sf "$BASE/api/health" -o /tmp/fo-health.json 2>/dev/null; then
  check "GET /api/health" 1 "$(cat /tmp/fo-health.json)"
else
  check "GET /api/health" 0 "Is 04-start-lan.sh running?"
fi

if curl -sf "$BASE/api/network/info" -o /tmp/fo-net.json 2>/dev/null; then
  check "GET /api/network/info" 1 "$(grep -o '"primaryLanIp":"[^"]*"' /tmp/fo-net.json 2>/dev/null || cat /tmp/fo-net.json)"
else
  check "GET /api/network/info" 0
fi

if [[ -d "$FINANCEOS_DATA/users" ]]; then
  check "DATA_DIR users/" 1 "$FINANCEOS_DATA/users"
else
  check "DATA_DIR users/" 0 "Restore backup with 03-restore-backup.sh"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "All checks passed."
  exit 0
fi
echo "$FAIL check(s) failed."
exit 1
