# Shared paths for FinanceOS Android hosting (Termux).
# Source: source "$(dirname "$0")/phone-paths.sh"

FINANCEOS_HOME="${FINANCEOS_HOME:-$HOME/financeos}"
FINANCEOS_APP="${FINANCEOS_APP:-$FINANCEOS_HOME/app}"
FINANCEOS_DATA="${FINANCEOS_DATA:-$FINANCEOS_HOME/data}"
FINANCEOS_LOGS="${FINANCEOS_LOGS:-$FINANCEOS_HOME/logs}"
FINANCEOS_STATE="${FINANCEOS_STATE:-$FINANCEOS_HOME/state}"
BACKUP_IMPORT="${BACKUP_IMPORT:-$FINANCEOS_HOME/backup-import}"
GIT_BRANCH="${GIT_BRANCH:-android-hosting}"
GIT_REPO="${GIT_REPO:-https://github.com/mshabraz/financeOS.git}"
PHONE_PORT="${PHONE_PORT:-3001}"
