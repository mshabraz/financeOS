#!/data/data/com.termux/files/usr/bin/bash
# Install Termux:Boot autostart for FinanceOS (run once on phone).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/phone-paths.sh"

BOOT_DIR="$HOME/.termux/boot"
BOOT_SCRIPT="$BOOT_DIR/financeos.sh"

# Termux:Boot has no CLI — it runs ~/.termux/boot/*.sh on device boot.
has_termux_boot() {
  pm list packages 2>/dev/null | grep -q 'com.termux.boot' && return 0
  pm list packages 2>/dev/null | grep -q 'termux.boot' && return 0
  return 1
}

if has_termux_boot; then
  echo "[boot] Termux:Boot package detected (com.termux.boot)"
else
  echo "[boot] Warning: could not verify com.termux.boot via pm."
  echo "[boot] If Termux:Boot is installed, continuing anyway..."
fi

mkdir -p "$BOOT_DIR" "$FINANCEOS_LOGS"

# Fix CRLF if scripts were edited on Windows
for f in "$SCRIPT_DIR"/*.sh; do
  sed -i 's/\r$//' "$f" 2>/dev/null || true
done

cat >"$BOOT_SCRIPT" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# Auto-start FinanceOS after device boot (installed by install-boot-autostart.sh)
LOG="$FINANCEOS_LOGS/boot.log"
echo "=== FinanceOS boot \$(date -Iseconds) ===" >>"\$LOG"

# Wait for Wi-Fi and system settle
sleep 45

bash "$SCRIPT_DIR/06-start-background.sh" >>"\$LOG" 2>&1 || true
sleep 5
bash "$SCRIPT_DIR/08-watchdog.sh" >>"\$LOG" 2>&1 || true
EOF

chmod +x "$BOOT_SCRIPT"
sed -i 's/\r$//' "$BOOT_SCRIPT" 2>/dev/null || true

echo "[boot] Installed: $BOOT_SCRIPT"
echo ""
echo "== Required phone settings (manual) =="
echo "  1. Settings → Apps → Termux → Battery → Unrestricted"
echo "  2. Settings → Apps → Termux:Boot → Battery → Unrestricted"
echo "  3. LineageOS: allow Termux autostart if prompted"
echo "  4. Keep phone on charger for 24/7 server use"
echo ""
echo "Test without reboot:"
echo "  bash $SCRIPT_DIR/06-start-background.sh"
echo "  curl http://127.0.0.1:$PHONE_PORT/api/health"
echo ""
echo "Test boot script manually:"
echo "  bash $BOOT_SCRIPT"
echo ""
echo "After reboot, check:"
echo "  tail -n 30 $FINANCEOS_LOGS/boot.log"
echo "  curl http://127.0.0.1:$PHONE_PORT/api/health"
