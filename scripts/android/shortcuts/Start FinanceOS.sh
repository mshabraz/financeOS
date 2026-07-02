#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ANDROID_SCRIPTS="$HOME/financeos/app/scripts/android"
source "$ANDROID_SCRIPTS/phone-paths.sh"
source "$ANDROID_SCRIPTS/shortcut-lib.sh"

bash "$ANDROID_SCRIPTS/06-start-background.sh"
IP="$(phone_ip)"
toast "FinanceOS started — http://$IP:$PHONE_PORT"
