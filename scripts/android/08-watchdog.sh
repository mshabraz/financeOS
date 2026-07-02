#!/data/data/com.termux/files/usr/bin/bash
# Watchdog: restart FinanceOS if /api/health fails (run in background).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

PIDFILE="$FINANCEOS_STATE/watchdog.pid"
LOGFILE="$FINANCEOS_LOGS/watchdog.log"
INTERVAL="${WATCHDOG_INTERVAL:-60}"

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "[watchdog] Already running (pid $(cat "$PIDFILE"))"
  exit 0
fi

(
  echo "[watchdog] Started $(date -Iseconds)" >>"$LOGFILE"
  while true; do
    if ! curl -sf "http://127.0.0.1:$PHONE_PORT/api/health" >/dev/null 2>&1; then
      echo "[watchdog] Health check failed — restarting $(date -Iseconds)" >>"$LOGFILE"
      bash "$SCRIPT_DIR/07-stop-financeos.sh" >>"$LOGFILE" 2>&1 || true
      sleep 2
      bash "$SCRIPT_DIR/06-start-background.sh" >>"$LOGFILE" 2>&1 || true
    fi
    sleep "$INTERVAL"
  done
) &

echo $! >"$PIDFILE"
echo "[watchdog] Running (pid $(cat "$PIDFILE"), interval ${INTERVAL}s)"
echo "[watchdog] Log: $LOGFILE"
