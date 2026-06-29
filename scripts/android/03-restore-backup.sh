#!/data/data/com.termux/files/usr/bin/bash
# Phase 1 — restore a PC backup snapshot into phone DATA_DIR (run ON THE PHONE).
# Usage:
#   bash 03-restore-backup.sh --latest
#   bash 03-restore-backup.sh 2026-06-29T12-00-00_before-android-trial
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

ARG="${1:-}"
if [[ -z "$ARG" || "$ARG" == "--help" || "$ARG" == "-h" ]]; then
  echo "Usage: $0 --latest | <backup-folder-name>"
  echo ""
  echo "Import folder must be under: $BACKUP_IMPORT/"
  echo "Available:"
  if [[ -d "$BACKUP_IMPORT" ]]; then
    ls -1 "$BACKUP_IMPORT" 2>/dev/null || echo "  (empty)"
  else
    echo "  (directory missing — create and copy backup here)"
  fi
  exit 1
fi

if [[ "$ARG" == "--latest" ]]; then
  FOLDER="$(ls -1 "$BACKUP_IMPORT" 2>/dev/null | sort -r | head -n 1)"
  if [[ -z "$FOLDER" ]]; then
    echo "[restore] No folders in $BACKUP_IMPORT"
    exit 1
  fi
else
  FOLDER="$ARG"
fi

SRC="$BACKUP_IMPORT/$FOLDER"
if [[ ! -d "$SRC" ]]; then
  echo "[restore] Not found: $SRC"
  exit 1
fi

echo "[restore] From: $SRC"
echo "[restore] To:   $FINANCEOS_DATA"
echo "[restore] Stop FinanceOS if it is running (Ctrl+C in start terminal)."
read -r -p "Continue? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || exit 0

# Backups from zip/sdcard often have modes that block Termux (cp -a → Permission denied).
fix_import_permissions() {
  local dir="$1"
  echo "[restore] Fixing permissions on import folder..."
  chmod -R u+rwX "$dir" 2>/dev/null || true
  find "$dir" -type d -exec chmod u+rwx {} + 2>/dev/null || true
  find "$dir" -type f -exec chmod u+rw {} + 2>/dev/null || true
}

copy_tree() {
  local from="$1"
  local to="$2"
  mkdir -p "$to"
  # tar avoids cp -a ownership/ACL issues from Windows/Android storage
  (cd "$from" && tar cf - .) | (cd "$to" && tar xf -)
}

fix_import_permissions "$SRC"
mkdir -p "$FINANCEOS_DATA"

for name in finance.db auth.json users-registry.json .session-secret; do
  if [[ -f "$SRC/$name" ]]; then
    cp -f "$SRC/$name" "$FINANCEOS_DATA/$name"
    echo "[restore] $name"
  fi
done

if [[ -d "$SRC/users" ]]; then
  echo "[restore] users/ (per-account databases)"
  rm -rf "$FINANCEOS_DATA/users"
  mkdir -p "$FINANCEOS_DATA/users"
  if ! copy_tree "$SRC/users" "$FINANCEOS_DATA/users"; then
    echo "[restore] tar copy failed — try: chmod -R u+rwX $SRC" >&2
    exit 1
  fi
  # Sanity check: at least one finance.db under users/
  if ! find "$FINANCEOS_DATA/users" -name 'finance.db' | grep -q .; then
    echo "[restore] ERROR: no finance.db found under users/ after restore" >&2
    echo "[restore] List import: ls -la $SRC/users/" >&2
    exit 1
  fi
  echo "[restore] users/ OK"
fi

if [[ -d "$SRC/certs" ]]; then
  mkdir -p "$FINANCEOS_DATA/certs"
  copy_tree "$SRC/certs" "$FINANCEOS_DATA/certs"
  echo "[restore] certs/"
fi

cd "$FINANCEOS_APP"
export DATA_DIR="$FINANCEOS_DATA"
npm run db:migrate

echo ""
echo "[restore] Done. Start with: bash scripts/android/04-start-lan.sh"
