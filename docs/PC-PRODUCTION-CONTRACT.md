# FinanceOS — PC production contract (frozen)

**Status:** ACTIVE — do not change production behavior until Android cutover (Phase 5).

This document defines the **authoritative PC-hosted FinanceOS instance**. Android hosting work must not alter any item below.

---

## Production identity

| Item | Value |
|------|--------|
| **Role** | Primary production server |
| **Hostname** | `ShabrazPC` |
| **LAN URL** | `http://192.168.1.25:3001` |
| **API health** | `http://192.168.1.25:3001/api/health` |
| **Network info** | `GET /api/network/info` (no login) |

Recorded: **2026-06-29** (Phase 0).

---

## Paths (App Server — never mix with Git)

| Path | Purpose |
|------|---------|
| `C:\FinanceOS\app\` | Git repository (`main` branch only for deploy) |
| `C:\FinanceOS\data\` | Live databases, auth, secrets — **never deleted by deploy** |
| `C:\FinanceOS\data\backups\` | Automatic + manual backups |
| `C:\FinanceOS\logs\` | Deploy and app logs |
| `C:\FinanceOS\state\` | Last deploy commit, status files |

---

## Deploy contract

| Rule | Detail |
|------|--------|
| **Deploy branch** | `main` only |
| **Trigger** | Push to `main` → `.github/workflows/deploy-lan-selfhosted.yml` |
| **Runner** | Self-hosted on App Server PC |
| **Effect** | Sync `C:\FinanceOS\app`, build, migrate, restart `FinanceOS` service |
| **Android branch** | `android-hosting` — **must never** trigger PC deploy |

---

## Service contract

| Component | Name / tool |
|-----------|-------------|
| Windows service | `FinanceOS` (NSSM) |
| Restart script | `scripts\windows\Restart-FinanceOSService.ps1` |
| Deploy script | `scripts\windows\Deploy-FinanceOS.ps1` |
| Backup script | `npm run db:backup` (from app dir, `DATA_DIR` on server) |
| Scheduled backup | Task `FinanceOS-DailyBackup` (03:00, if registered) |

---

## What Android work must NOT do (until cutover)

- Change PC `.env`, NSSM config, firewall, or port **3001**
- Merge sync/multi-node/schema-for-sync code into `main` before cutover
- Run Android deploy scripts against `C:\FinanceOS\`
- Syncthing/rsync live `finance.db` between PC and phone
- Re-point open banking OAuth to the phone while PC is production
- Stop or restart PC `FinanceOS` service for Android experiments

---

## Safe operations on PC (allowed anytime)

- Read-only: `GET /api/health`, `GET /api/network/info`
- Manual backup: `npm run db:backup -- --label <name>` on App Server (creates snapshot under `data\backups\`)
- Browse production URL as a normal client
- Develop on `android-hosting` branch without merging to `main`

---

## Cutover gate (Phase 5 only)

PC production is decommissioned only when:

1. Android Phase 3 validation checklist is signed off
2. Final PC backup (`before-cutover`) exists
3. `FinanceOS` service stopped and auto-deploy disabled **deliberately**
4. Household bookmarks updated to phone URL

Until then, **this PC instance remains the source of truth**.
