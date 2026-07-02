#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ANDROID_SCRIPTS="$HOME/financeos/app/scripts/android"
source "$ANDROID_SCRIPTS/phone-paths.sh"
source "$ANDROID_SCRIPTS/shortcut-lib.sh"

IP="$(phone_ip)"
if curl -sf "http://127.0.0.1:$PHONE_PORT/api/health" >/dev/null 2>&1; then
  toast "FinanceOS OK — http://$IP:$PHONE_PORT"
else
  toast "FinanceOS not running"
fi
