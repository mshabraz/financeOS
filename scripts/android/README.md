# Android hosting scripts (`android-hosting` branch only)

These scripts support **phone-side** FinanceOS hosting. They must **not** be run against `C:\FinanceOS\` on the production PC.

| Script | Purpose |
|--------|---------|
| `phone-paths.sh` | Shared Termux paths (`~/financeos/...`) |
| `01-install-termux-deps.sh` | Install git, Node LTS, build tools |
| `02-clone-and-setup.sh` | Clone `android-hosting`, npm setup, build UI |
| `03-restore-backup.sh` | Import one-time PC backup snapshot |
| `04-start-lan.sh` | Start FinanceOS LAN mode (foreground) |
| `05-verify-phone.sh` | Health checks on phone |
| `verify-phase0.ps1` | Read-only PC production checks (Windows) |
| `windows/Export-BackupForPhone.ps1` | Create PC backup for phone import |
| `windows/Verify-PhonePhase1.ps1` | LAN check PC + phone endpoints |

**Phase 1 guide:** `docs/ANDROID-PHASE1-CHECKLIST.md`

**Phase 2** will add Termux:Boot, watchdog, and phone-only deploy.
