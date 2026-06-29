# Android hosting scripts (`android-hosting` branch only)

These scripts support **phone-side** FinanceOS hosting. They must **not** be run against `C:\FinanceOS\` on the production PC.

| Script | Purpose |
|--------|---------|
| `verify-phase0.ps1` | Read-only checks that PC production is healthy (run from LAN) |

**Phase 1** will add:

- `install-termux-deps.sh` — Node, git, build deps in Termux
- `deploy-phone.sh` — backup, pull, build, migrate, restart
- `financeos-service.sh` — watchdog + health check loop

See `docs/ANDROID-HOSTING.md` and `docs/ANDROID-PHASE0-CHECKLIST.md`.
