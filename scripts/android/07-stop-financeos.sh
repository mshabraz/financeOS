#!/data/data/com.termux/files/usr/bin/bash
# Stop background FinanceOS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

PIDFILE="$FINANCEOS_STATE/financeos.pid"

if [[ -f "$PIDFILE" ]]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
    echo "[stop] Stopped pid $PID"
  else
    echo "[stop] Stale pid file (process not running)"
  fi
  rm -f "$PIDFILE"
else
  echo "[stop] No pid file — trying pkill for FinanceOS node"
  pkill -f "financeos/app/backend" 2>/dev/null || true
fi

# Stop watchdog if running
WD_PIDFILE="$FINANCEOS_STATE/watchdog.pid"
if [[ -f "$WD_PIDFILE" ]]; then
  WDPID="$(cat "$WD_PIDFILE")"
  kill "$WDPID" 2>/dev/null || true
  rm -f "$WD_PIDFILE"
fi
