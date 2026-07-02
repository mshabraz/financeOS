#!/data/data/com.termux/files/usr/bin/bash
# Start FinanceOS in the background (survives closing Termux session).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=phone-paths.sh
source "$SCRIPT_DIR/phone-paths.sh"

PIDFILE="$FINANCEOS_STATE/financeos.pid"
LOGFILE="$FINANCEOS_LOGS/financeos.log"

mkdir -p "$FINANCEOS_LOGS" "$FINANCEOS_STATE"

if [[ -f "$PIDFILE" ]]; then
  OLD_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[start] Already running (pid $OLD_PID)"
  else
    rm -f "$PIDFILE"
  fi
fi

if [[ -f "$PIDFILE" ]]; then
  exit 0
fi

if [[ ! -d "$FINANCEOS_APP/frontend/dist" ]]; then
  echo "[start] frontend/dist missing — run: bash scripts/android/02-clone-and-setup.sh" >&2
  exit 1
fi

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"
export DATA_DIR="$FINANCEOS_DATA"

cd "$FINANCEOS_APP"
nohup npm run start:lan --prefix backend >>"$LOGFILE" 2>&1 &
echo $! >"$PIDFILE"

sleep 2
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  IP="$(ip -4 addr show wlan0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -n1)"
  [[ -z "$IP" ]] && IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "[start] FinanceOS running (pid $(cat "$PIDFILE"))"
  echo "[start] Log: $LOGFILE"
  echo "[start] URL: http://${IP:-<wifi-ip>}:$PHONE_PORT"
else
  echo "[start] Failed to start — see $LOGFILE" >&2
  rm -f "$PIDFILE"
  tail -n 20 "$LOGFILE" 2>/dev/null || true
  exit 1
fi
