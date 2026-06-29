#!/data/data/com.termux/files/usr/bin/bash
# Phase 1 — clone android-hosting branch, install deps, build UI (run ON THE PHONE).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"

echo "== FinanceOS Phase 1: clone and setup =="
mkdir -p "$(dirname "$FINANCEOS_APP")" "$FINANCEOS_DATA" "$FINANCEOS_LOGS"

if [[ -d "$FINANCEOS_APP/.git" ]]; then
  echo "[setup] Repo exists — pulling $GIT_BRANCH"
  git -C "$FINANCEOS_APP" fetch origin "$GIT_BRANCH"
  git -C "$FINANCEOS_APP" checkout "$GIT_BRANCH"
  git -C "$FINANCEOS_APP" pull --ff-only origin "$GIT_BRANCH" || true
else
  echo "[setup] Cloning $GIT_REPO (branch $GIT_BRANCH)"
  git clone -b "$GIT_BRANCH" --depth 1 "$GIT_REPO" "$FINANCEOS_APP"
fi

ENV_FILE="$FINANCEOS_APP/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
HOST=0.0.0.0
PORT=$PHONE_PORT
LAN_MODE=true
SERVE_FRONTEND=true
AUTH_ENABLED=true
DATA_DIR=$FINANCEOS_DATA
MDNS_ENABLED=false
EOF
  echo "[setup] Created $ENV_FILE"
else
  echo "[setup] .env exists — left unchanged"
fi

cd "$FINANCEOS_APP"
echo "[setup] npm install (root + backend + frontend) — may take 10–20 min on phone"
npm run setup

echo "[setup] Building frontend — may take several minutes"
npm run build

echo "[setup] DB migrate (empty or existing phone data)"
npm run db:migrate

echo ""
echo "== Setup complete =="
echo "  App:  $FINANCEOS_APP"
echo "  Data: $FINANCEOS_DATA"
echo ""
echo "Next:"
echo "  1) Copy PC backup into $BACKUP_IMPORT/<folder-name>/"
echo "  2) bash scripts/android/03-restore-backup.sh --latest"
echo "  3) bash scripts/android/04-start-lan.sh"
