#!/data/data/com.termux/files/usr/bin/bash
# Shared helpers for home-screen shortcuts.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=phone-paths.sh
source "$SCRIPT_DIR/phone-paths.sh"

phone_ip() {
  local ip
  ip="$(ip -4 addr show wlan0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -n1)"
  [[ -z "$ip" ]] && ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "${ip:-127.0.0.1}"
}

toast() {
  if command -v termux-toast >/dev/null 2>&1; then
    termux-toast "$1"
  else
    echo "$1"
  fi
}

open_url() {
  local url="$1"
  if command -v termux-open-url >/dev/null 2>&1; then
    termux-open-url "$url"
  else
    echo "Open in browser: $url"
  fi
}
