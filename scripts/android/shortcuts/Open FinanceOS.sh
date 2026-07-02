#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ANDROID_SCRIPTS="$HOME/financeos/app/scripts/android"
source "$ANDROID_SCRIPTS/phone-paths.sh"
source "$ANDROID_SCRIPTS/shortcut-lib.sh"

IP="$(phone_ip)"
URL="http://$IP:$PHONE_PORT"

if curl -sf "http://127.0.0.1:$PHONE_PORT/api/health" >/dev/null 2>&1; then
  open_url "$URL"
  toast "Opening FinanceOS"
else
  bash "$ANDROID_SCRIPTS/06-start-background.sh"
  sleep 2
  if curl -sf "http://127.0.0.1:$PHONE_PORT/api/health" >/dev/null 2>&1; then
    open_url "$URL"
    toast "Started and opened FinanceOS"
  else
    toast "FinanceOS not running — check logs"
  fi
fi
