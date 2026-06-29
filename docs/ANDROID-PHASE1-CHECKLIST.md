# Phase 1 — Standalone FinanceOS on phone

**Branch:** `android-hosting` only  
**PC production:** unchanged — keep using `http://192.168.1.25:3001`

Install FinanceOS on the Redmi Note 8T (Termux), seed from a **one-time PC backup**, serve on LAN at the phone IP.

---

## Before you start

| Item | Status |
|------|--------|
| Phase 0 complete | `android-hosting` branch on GitHub |
| Phone on **charger** | Required |
| F-Droid: **Termux** + **Termux:Boot** installed | You |
| Router: static IP **`192.168.1.26`** for phone | You (recommended) |
| USB debugging + `adb` on PC | Optional (easier backup transfer) |

---

## Part A — PC: create backup (does not stop production)

On **ShabrazPC** or any machine with access to production data:

```powershell
cd C:\Users\muhammad.shabraz\finance-manager
git checkout android-hosting
git pull origin android-hosting

powershell -ExecutionPolicy Bypass -File scripts\android\windows\Export-BackupForPhone.ps1 -Label before-android-trial
```

Optional USB push (phone connected, debugging on):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\android\windows\Export-BackupForPhone.ps1 -Label before-android-trial -PushViaAdb
```

Confirm PC still works:

```powershell
Invoke-RestMethod http://192.168.1.25:3001/api/health
```

---

## Part B — Phone: Termux setup

Open **Termux** on the phone.

### B1. Get Phase 1 scripts

**Option 1 — clone now (recommended):**

```bash
pkg install -y git
git clone -b android-hosting https://github.com/mshabraz/financeOS.git ~/financeos/app
```

**Option 2 — install deps first, clone in step B2**

### B2. Install packages

```bash
bash ~/financeos/app/scripts/android/01-install-termux-deps.sh
```

When prompted for storage, tap **Allow** (needed to read Downloads backup).

### B3. Clone, build, configure

```bash
bash ~/financeos/app/scripts/android/02-clone-and-setup.sh
```

This takes **15–40 minutes** on the phone (npm install + Vite build). Keep charger connected.

---

## Part C — Import PC backup onto phone

Copy backup folder into `~/financeos/backup-import/<folder-name>/`.

### If you used `adb push`:

```bash
mkdir -p ~/financeos/backup-import
FOLDER="$(ls -1 ~/storage/downloads/financeos-backup | sort -r | head -n1)"
cp -a ~/storage/downloads/financeos-backup/"$FOLDER" ~/financeos/backup-import/
```

### If you copied manually (USB / cloud download):

Unzip/copy so this exists:

```
~/financeos/backup-import/<timestamp>_before-android-trial/
  users/
  users-registry.json
  .session-secret
  (optional certs/)
```

### Restore:

```bash
bash ~/financeos/app/scripts/android/03-restore-backup.sh --latest
```

---

## Part D — Start and verify

### On phone (Termux):

```bash
bash ~/financeos/app/scripts/android/04-start-lan.sh
```

Leave this session open (foreground). Note the URL printed (e.g. `http://192.168.1.26:3001`).

### On phone (second Termux session):

```bash
bash ~/financeos/app/scripts/android/05-verify-phone.sh
```

### From your PC (LAN):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\android\windows\Verify-PhonePhase1.ps1
```

Or browser: `http://192.168.1.26:3001` — log in with your **existing** credentials (copied from PC backup).

---

## Phase 1 exit criteria

| Check | Expected |
|-------|----------|
| PC `http://192.168.1.25:3001` | Still works, unchanged data |
| Phone `http://192.168.1.26:3001/api/health` | `status: ok` |
| Login on phone | Same accounts as PC snapshot |
| Transactions visible | Match backup point-in-time |
| Open banking on phone | **Do not connect yet** — PC remains bank host until cutover |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm run build` OOM | `export NODE_OPTIONS=--max-old-space-size=512` and retry |
| Termux killed app | Disable battery optimization for Termux; keep charger |
| Cannot reach phone from PC | Same Wi‑Fi; confirm phone IP; disable VPN |
| Login fails | Re-run restore; check `~/financeos/data/users/` exists |
| Wrong branch on phone | `git -C ~/financeos/app checkout android-hosting` |

---

## What Phase 2 adds (next)

- Boot auto-start (Termux:Boot)
- Watchdog / crash restart
- Phone-only git deploy script
- No changes to PC production

---

## Quick command reference (phone)

```bash
# Start (foreground)
bash ~/financeos/app/scripts/android/04-start-lan.sh

# Verify
bash ~/financeos/app/scripts/android/05-verify-phone.sh

# Re-pull updates (later)
git -C ~/financeos/app pull origin android-hosting
```
