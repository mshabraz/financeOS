#!/usr/bin/env bash
# FinanceOS first-time setup (Mac/Linux)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "FinanceOS setup"
node scripts/setup.mjs
