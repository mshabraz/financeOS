#!/usr/bin/env bash
# FinanceOS — LAN mode (Linux/macOS)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "FinanceOS — LAN startup"

echo "[1/3] Building frontend..."
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run build

echo "[2/3] Installing backend..."
cd "$ROOT/backend"
[ -d node_modules ] || npm install

echo "[3/3] Starting server..."
export HOST=0.0.0.0
export PORT=3001
export LAN_MODE=true
export AUTH_ENABLED=true
export SERVE_FRONTEND=true

exec node src/index.js
