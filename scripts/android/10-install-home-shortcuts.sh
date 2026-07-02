#!/data/data/com.termux/files/usr/bin/bash
# Install home-screen shortcuts (Termux:Widget). Run once on phone.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

SHORTCUT_DIR="$HOME/.shortcuts"
ANDROID_DIR="$SCRIPT_DIR/shortcuts"

mkdir -p "$SHORTCUT_DIR"

for f in "$SCRIPT_DIR"/*.sh "$ANDROID_DIR"/*.sh; do
  [[ -f "$f" ]] && sed -i 's/\r$//' "$f" 2>/dev/null || true
done

install_shortcut() {
  local name="$1"
  local src="$ANDROID_DIR/$1.sh"
  local dest="$SHORTCUT_DIR/$1.sh"
  if [[ ! -f "$src" ]]; then
    echo "[shortcut] Missing template: $src" >&2
    return 1
  fi
  cp "$src" "$dest"
  chmod +x "$dest"
  sed -i 's/\r$//' "$dest" 2>/dev/null || true
  echo "[shortcut] $dest"
}

echo "== FinanceOS home shortcuts =="
install_shortcut "Start FinanceOS"
install_shortcut "Stop FinanceOS"
install_shortcut "Open FinanceOS"
install_shortcut "FinanceOS Status"

echo ""
if pm list packages 2>/dev/null | grep -q 'com.termux.widget'; then
  echo "[shortcut] Termux:Widget detected."
else
  echo "[shortcut] Install 'Termux:Widget' from F-Droid for home-screen buttons."
fi

if command -v termux-toast >/dev/null 2>&1; then
  echo "[shortcut] Termux:API commands available."
else
  echo "[shortcut] Optional: install 'Termux:API' app + run: pkg install termux-api"
  echo "           (enables toast notifications and open browser)"
fi

echo ""
echo "== Add to home screen =="
echo "  1. Long-press home screen → Widgets"
echo "  2. Find 'Termux:Widget'"
echo "  3. Drag widget onto home screen"
echo "  4. Tap widget → pick 'Start FinanceOS' (or any shortcut)"
echo ""
echo "On some launchers you can resize the widget to a single large button."
