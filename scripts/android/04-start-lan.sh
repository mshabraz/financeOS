#!/data/data/com.termux/files/usr/bin/bash
# Phase 1 — start FinanceOS in LAN mode (run ON THE PHONE; foreground).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
export DATA_DIR="$FINANCEOS_DATA"

cd "$FINANCEOS_APP"

if [[ ! -d "$FINANCEOS_APP/frontend/dist" ]]; then
  echo "[start] frontend/dist missing — run: npm run build"
  exit 1
fi

IP="$(ip -4 addr show wlan0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -n1)"
if [[ -z "$IP" ]]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

echo "== FinanceOS LAN (phone) =="
echo "  Data: $FINANCEOS_DATA"
echo "  Port: $PHONE_PORT"
echo "  URL:  http://${IP:-<wifi-ip>}:$PHONE_PORT"
echo ""
echo "  PC production (unchanged): http://192.168.1.25:3001"
echo ""
echo "Press Ctrl+C to stop."
echo ""

exec npm run start:lan --prefix backend
