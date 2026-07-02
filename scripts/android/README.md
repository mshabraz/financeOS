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
| `06-start-background.sh` | Start in background (survives closing Termux) |
| `07-stop-financeos.sh` | Stop background server |
| `08-watchdog.sh` | Restart if health check fails |
| `09-install-boot-autostart.sh` | Install Termux:Boot script |
| `verify-phase0.ps1` | Read-only PC production checks (Windows) |
| `windows/Export-BackupForPhone.ps1` | Create PC backup for phone import |
| `windows/Verify-PhonePhase1.ps1` | LAN check PC + phone endpoints |

**Phase 1 guide:** `docs/ANDROID-PHASE1-CHECKLIST.md`  
**Phase 2 autostart:** `docs/ANDROID-PHASE2-AUTOSTART.md`
