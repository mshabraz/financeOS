#!/data/data/com.termux/files/usr/bin/bash
# Phase 1 — install Termux packages for FinanceOS (run ON THE PHONE in Termux).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=phone-paths.sh
source "$SCRIPT_DIR/phone-paths.sh"

echo "== FinanceOS Phase 1: Termux dependencies =="
echo "Home: $FINANCEOS_HOME"
echo ""

pkg update -y
pkg upgrade -y
pkg install -y git nodejs-lts python make clang openssl-tool curl

NODE_VER="$(node -v 2>/dev/null || echo missing)"
GIT_VER="$(git --version 2>/dev/null || echo missing)"
echo ""
echo "Node: $NODE_VER"
echo "Git:  $GIT_VER"

mkdir -p "$FINANCEOS_HOME" "$FINANCEOS_DATA" "$FINANCEOS_LOGS" "$FINANCEOS_STATE" "$BACKUP_IMPORT"

if ! command -v termux-setup-storage >/dev/null 2>&1; then
  echo "[warn] termux-setup-storage not found (unexpected on Termux)"
else
  if [[ ! -d "$HOME/storage/downloads" ]]; then
    echo ""
    echo "Grant storage access (tap Allow on the phone):"
    termux-setup-storage
  fi
fi

echo ""
echo "== Done. Next (in Termux): =="
echo "  git clone -b android-hosting https://github.com/mshabraz/financeOS.git ~/financeos/app"
echo "  bash ~/financeos/app/scripts/android/02-clone-and-setup.sh"
