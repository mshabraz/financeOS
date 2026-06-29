# Phase 0 checklist — Android hosting (complete)

**Completed:** 2026-06-29  
**Branch:** `android-hosting`  
**Base commit:** `4cb806ce` (same as `origin/main` at Phase 0 start)

---

## Deliverables

- [x] **PC production contract** documented (`docs/PC-PRODUCTION-CONTRACT.md`)
- [x] **Android hosting plan** documented (`docs/ANDROID-HOSTING.md`)
- [x] **`android-hosting` branch** created from `origin/main` (no `main` changes)
- [x] **CI workflow** for `android-hosting` only (GitHub-hosted runner — does not touch App Server)
- [x] **Phase 0 verify script** (`scripts/android/verify-phase0.ps1`)
- [x] **Phone env template** (`config/android-hosting.env.example`)
- [x] **Backup script verified** locally (`npm run db:backup -- --label phase0-verify`)
- [x] **Production LAN endpoint confirmed** (`192.168.1.25:3001` — ShabrazPC)
- [ ] **Router: static IP for phone** — **you** assign `192.168.1.26` (see below)
- [ ] **App Server: daily backup task** — verify on ShabrazPC if not already registered

---

## Quick verification (5 minutes)

Run from any machine on the same Wi‑Fi.

### 1. PC production still works

```powershell
Invoke-RestMethod http://192.168.1.25:3001/api/health
Invoke-RestMethod http://192.168.1.25:3001/api/network/info
```

Expect: `status: ok` (or healthy JSON) and `primaryLanIp: 192.168.1.25`.

### 2. Phase 0 script (read-only)

```powershell
cd C:\FinanceOS\app   # or your dev clone
git fetch origin
git checkout android-hosting
powershell -ExecutionPolicy Bypass -File scripts\android\verify-phase0.ps1
```

Expect: all checks **PASS**; no restarts, no file writes on App Server.

### 3. Branch isolation

```powershell
git branch --show-current   # android-hosting on dev machine
git log -1 --oneline
```

On GitHub: branch `android-hosting` exists; **`main` was not advanced** by Phase 0.

### 4. PC deploy unchanged

Confirm `.github/workflows/deploy-lan-selfhosted.yml` on **`main`** still triggers only on `push: branches: [main]`.

Pushing `android-hosting` must **not** restart `FinanceOS` on ShabrazPC.

### 5. Backup (on App Server — optional confirm)

On **ShabrazPC** (elevated PowerShell):

```powershell
cd C:\FinanceOS\app
node scripts\backup-db.mjs -- --label phase0-production-check
dir C:\FinanceOS\data\backups | Select-Object -Last 3
```

Expect: new folder under `C:\FinanceOS\data\backups\`.

Check scheduled task (optional):

```powershell
Get-ScheduledTask -TaskName FinanceOS-DailyBackup -ErrorAction SilentlyContinue | Format-List TaskName, State
```

If missing, register once (does not affect running app):

```powershell
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Register-BackupTask.ps1
```

---

## Router: static IP for phone (manual — you)

1. On phone: **Settings → About phone → Status** → note **Wi‑Fi MAC address**.
2. On router: **DHCP reservation** → MAC → IP **`192.168.1.26`**, name `FinanceOS-Phone`.
3. Reconnect phone to Wi‑Fi; confirm IP (Phase 1 prep).

---

## Prepare for Phase 1

### On the phone (before Termux install)

- [ ] LineageOS updated, root working, phone **on charger**
- [ ] Disable battery optimization for Termux (after install in Phase 1)
- [ ] Install **F-Droid**, enable **Unknown sources** for F-Droid if needed
- [ ] Note Wi‑Fi MAC for static IP above
- [ ] Free **≥ 8 GB** storage

### F-Droid packages to install in Phase 1

- Termux  
- Termux:Boot  
- (Later) termux-services from its F-Droid repo  

### One-time data seed (Phase 1 — after phone app runs)

1. On ShabrazPC: `node C:\FinanceOS\app\scripts\backup-db.mjs -- --label before-android-trial`
2. Copy backup folder to PC desktop/USB (not Syncthing of live DB)
3. Phase 1 doc will cover `adb push` or USB copy + restore on phone

### ADB (when you are ready for Phase 1)

- Enable **Developer options → USB debugging** on phone
- Install [Platform tools](https://developer.android.com/tools/releases/platform-tools) on PC
- `adb devices` should list the phone

### Git on phone (Phase 1)

Clone **this branch only**:

```bash
git clone -b android-hosting https://github.com/mshabraz/financeOS.git ~/financeos/app
```

Do **not** point the phone at `C:\FinanceOS\data`.

---

## Phase 0 exit criteria

| Criterion | Status |
|-----------|--------|
| PC URL works unchanged | Verified 2026-06-29 |
| `android-hosting` branch pushed | Pending push after commit |
| No `main` merge for Android work | Enforced |
| Phone static IP reserved | **Your router step** |
| Backup path understood | Documented |

**Phase 1 starts** after you confirm verification above and complete router static IP.
