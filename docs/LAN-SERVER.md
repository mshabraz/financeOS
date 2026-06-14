# FinanceOS — Two-PC LAN architecture (Dev PC + App Server)

Move the **running app and all data** to a second Windows PC on your home network. Keep **coding in Cursor** on your current PC. Push to GitHub → the App Server updates itself.

---

## Table of contents

1. [Recommended architecture](#1-recommended-architecture)
2. [Git-based auto-update workflow](#2-git-based-auto-update-workflow)
3. [Windows deployment strategy](#3-windows-deployment-strategy)
4. [Safe data persistence strategy](#4-safe-data-persistence-strategy)
5. [Auto-restart / Windows service setup](#5-auto-restart--windows-service-setup)
6. [Rollback and failed deployments](#6-rollback-and-failed-deployments)
7. [Backup system](#7-backup-system)
8. [Security and network configuration](#8-security-and-network-configuration)
9. [Step-by-step setup (both PCs)](#9-step-by-step-setup-both-pcs)
10. [Commands, scripts, and configs](#10-commands-scripts-and-configs)
11. [Lowest-maintenance solution](#11-lowest-maintenance-solution)

---

## 1. Recommended architecture

### You already have client/server

FinanceOS is **not** a single desktop program. It is:

| Layer | Technology | Runs on |
|-------|------------|---------|
| **Client (UI)** | React (browser) | Phone, tablet, Dev PC — any device on Wi‑Fi |
| **Server (API)** | Node.js + Express | **App Server PC only** |
| **Data** | SQLite (`finance.db`) | **App Server PC only** |

No rewrite is required. You **relocate the server** and point browsers at the App Server IP.

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Development PC (Cursor)    │         │  App Server PC (2nd Windows) │
│  • Edit code                │  git    │  • Git clone                 │
│  • git push ────────────────┼────────►│  • Auto-deploy script        │
│  • Optional: Vite dev UI    │  push   │  • Node API + built UI       │
│    → API on App Server      │         │  • finance.db + backups      │
└─────────────────────────────┘         │  • Windows Service (NSSM)    │
            │                           └──────────────┬───────────────┘
            │  Wi‑Fi (LAN)                              │
            └──────────────────────────────────────────┘
                    Phone / tablet / Dev PC browser
                    http://192.168.x.x:3001
```

### Folder layout on App Server (never mix with Git)

| Path | Purpose |
|------|---------|
| `C:\FinanceOS\app\` | Git repository (code only) |
| `C:\FinanceOS\data\` | `finance.db`, `auth.json`, secrets — **never deleted by deploy** |
| `C:\FinanceOS\data\backups\` | Automatic backups |
| `C:\FinanceOS\logs\` | Deploy logs + optional app logs |
| `C:\FinanceOS\state\` | Last good Git commit, deploy status |

### Recommended stack (beginner-friendly, €0)

| Need | Tool | Why |
|------|------|-----|
| Run Node 24/7 | **NSSM** (Windows Service) | Starts at boot, restarts on crash, no login window |
| Auto-deploy on `git push` | **GitHub self-hosted runner** on App Server | Hands-free; runs `Deploy-FinanceOS.ps1` locally |
| Fallback if runner offline | **Scheduled Task** every 5 min | Polls `git fetch` and deploys if changed |
| Backups | **Task Scheduler** daily + `backup-db.mjs` | Before deploy + nightly |
| LAN access | Existing **LAN_MODE** + firewall script | Port **3001**, single URL |
| Dev API target | `frontend/.env.local` on Dev PC | Optional live-reload UI against server |

**Not recommended for this setup:** Docker on Windows (heavier), cloud hosting (different doc), Netlify (wrong architecture).

---

## 2. Git-based auto-update workflow

```
Cursor (Dev PC)
    │
    ▼ git commit + git push origin main
GitHub (private repo)
    │
    ▼ workflow: deploy-lan-selfhosted.yml
    │   runs-on: self-hosted  (App Server)
    ▼
Deploy-FinanceOS.ps1
    ├─ 1. Backup database (label: pre-deploy)
    ├─ 2. Save current Git commit → state\last-good.json
    ├─ 3. git pull
    ├─ 4. npm install (backend + frontend) if needed
    ├─ 5. npm run build (frontend)
    ├─ 6. npm run db:migrate
    ├─ 7. nssm restart FinanceOS
    ├─ 8. Health check GET /api/health
    └─ 9. On failure → rollback (git + optional DB restore)
```

| Event | Data on `C:\FinanceOS\data` |
|-------|-----------------------------|
| `git pull` | Untouched |
| `npm run build` | Untouched |
| `db:migrate` | Schema only; rows preserved |
| Failed deploy | Rollback code; DB restore from pre-deploy backup if needed |

---

## 3. Windows deployment strategy

### One-time install (App Server)

Run **`scripts\windows\Install-FinanceOSServer.ps1`** as Administrator (see §9).

### Every deploy (automatic)

**`scripts\windows\Deploy-FinanceOS.ps1`** — used by GitHub Actions runner and optionally by scheduled poll.

### Production mode on App Server

| Setting | Value |
|---------|--------|
| `LAN_MODE` | `true` |
| `SERVE_FRONTEND` | `true` (one port: **3001**) |
| `AUTH_ENABLED` | `true` |
| `DATA_DIR` | `C:\FinanceOS\data` |
| `HOST` | `0.0.0.0` |

Copy **`.env.server.example`** → `C:\FinanceOS\app\.env`.

### Development PC after cutover

| Task | How |
|------|-----|
| Edit backend/frontend | Cursor on Dev PC |
| Test UI against live server | Browser → `http://APP_SERVER_IP:3001` |
| Optional hot-reload UI | `frontend/.env.local` → `VITE_API_URL=http://APP_SERVER_IP:3001/api` then `npm run dev` |
| **Do not** use local `backend\data\finance.db` for real data | Master DB is on App Server |

---

## 4. Safe data persistence strategy

### Rules

1. **`C:\FinanceOS\data` is outside the Git repo** — deploy never runs `git clean` on data.
2. **`.gitignore`** already excludes `*.db`, `auth.json`, `.env`.
3. **Migrations** are forward-only in `schema.js`; always backup before deploy.
4. **CSV uploads** are stored in SQLite (transactions table), not as loose files on disk (unless you add export folders later).

### Move data once (Dev PC → App Server)

```powershell
# On Dev PC — backup first
cd C:\Users\muhammad.shabraz\finance-manager
npm run db:backup -- --label before-lan-server-move

# Copy to App Server (replace IP and share path)
Copy-Item backend\data\finance.db \\APP-SERVER\FinanceOSShare\finance.db
Copy-Item backend\data\auth.json \\APP-SERVER\FinanceOSShare\auth.json
# Or USB / scp / Remote Desktop drag-drop to C:\FinanceOS\data\
```

After copy, **stop using** the old DB on the Dev PC for daily imports.

---

## 5. Auto-restart / Windows service setup

### NSSM service (recommended)

- Service name: **FinanceOS**
- Runs: `node.exe` with `backend\src\index.js --lan`
- Working directory: `C:\FinanceOS\app\backend`
- Loads env from `C:\FinanceOS\app\.env`
- **Automatic** restart on crash
- **Automatic** start at boot (no user login required if service account configured)

Install: **`scripts\windows\Install-FinanceOSService.ps1`** (requires NSSM on PATH).

### After Windows Update / reboot

Service starts automatically. No need to open Cursor or `START-LAN.bat` on the App Server.

### Optional: keep `START-LAN.bat` for manual debugging

Use only when fixing issues; normal operation is the Windows service.

---

## 6. Rollback and failed deployments

### Deploy script behavior

| Step | On failure |
|------|------------|
| Health check fails after deploy | `git reset --hard` to **last-good** commit, rebuild, restart service |
| Migrate throws | Log error; optionally restore `finance.db` from pre-deploy backup folder |
| Build fails | Do not restart service; stay on previous build |

### Logs

| File | Content |
|------|---------|
| `C:\FinanceOS\logs\deploy.log` | Timestamped deploy steps |
| `C:\FinanceOS\state\last-deploy.json` | Commit, success/fail, duration |
| `C:\FinanceOS\state\last-good.json` | Last known good commit SHA |

### Manual rollback

```powershell
cd C:\FinanceOS\app
git log --oneline -5
git checkout <previous-commit>
powershell -ExecutionPolicy Bypass -File scripts\windows\Deploy-FinanceOS.ps1 -SkipPull
```

Database restore:

```powershell
cd C:\FinanceOS\app
node scripts\restore-db.mjs -- --latest --yes
# Stop service first: nssm stop FinanceOS
```

---

## 7. Backup system

| When | Action |
|------|--------|
| **Before every deploy** | `backup-db.mjs --label pre-deploy` |
| **Daily 3:00 AM** | Scheduled task `FinanceOS-Backup` |
| **Before manual schema experiment** | `npm run db:backup -- --label manual` |

Backups: `C:\FinanceOS\data\backups\<timestamp>_<label>\`

Retention (optional): keep last 30 folders; delete older via monthly script.

---

## 8. Security and network configuration

### Network

| Item | Setting |
|------|---------|
| App URL | `http://<App-Server-LAN-IP>:3001` |
| Firewall | Allow inbound **TCP 3001** on Private profile |
| Wi‑Fi | **Private** network on both PCs (Windows Settings) |
| Hostname | Optional: `http://financeos.local` via router DNS (advanced) |

Run once (elevated): `scripts\ensure-firewall.ps1`

### Authentication

- Keep **`AUTH_ENABLED=true`**
- Password hash in `C:\FinanceOS\data\auth.json`
- Set **`SESSION_SECRET`** in `.env` on App Server (long random string)
- **Do not** expose port 3001 to the public internet (router port-forward) unless you add HTTPS and understand the risk

### LAN-only privacy

- Private GitHub repo
- App only on home Wi‑Fi
- Strong unique password on first visit to App Server URL

---

## 9. Step-by-step setup (both PCs)

### Prerequisites (both machines)

- [ ] Node.js 18+ installed: https://nodejs.org
- [ ] Git installed
- [ ] Same home network / Wi‑Fi
- [ ] GitHub repo access (private): `financeOS`

---

### Part A — App Server PC (one-time, ~1–2 hours)

#### A1. Create folders

Open **PowerShell as Administrator**:

```powershell
New-Item -ItemType Directory -Force -Path C:\FinanceOS\app, C:\FinanceOS\data, C:\FinanceOS\data\backups, C:\FinanceOS\logs, C:\FinanceOS\state
```

#### A2. Clone the repository

```powershell
cd C:\FinanceOS\app
git clone https://github.com/mshabraz/financeOS.git .
```

(Use a personal access token if private.)

#### A3. Run the installer script

```powershell
cd C:\FinanceOS\app
powershell -ExecutionPolicy Bypass -File .\scripts\windows\Install-FinanceOSServer.ps1
```

This copies `.env.server.example` → `.env`, sets `DATA_DIR`, runs `npm run setup`, builds frontend, opens firewall.

Edit `.env` if needed:

```powershell
notepad C:\FinanceOS\app\.env
```

Set `SESSION_SECRET` (random) — see §10.

#### A4. Copy your database from Dev PC

Copy `finance.db` and `auth.json` into **`C:\FinanceOS\data\`**.

#### A5. Install NSSM and the Windows service

1. Download NSSM from https://nssm.cc/download (or `choco install nssm` if you use Chocolatey).
2. Add `nssm.exe` to PATH or note full path.
3. Run:

```powershell
cd C:\FinanceOS\app
powershell -ExecutionPolicy Bypass -File .\scripts\windows\Install-FinanceOSService.ps1
```

4. Verify: open `http://localhost:3001` on the App Server.

#### A6. Note the LAN IP

```powershell
ipconfig
# Example: 192.168.1.50
```

Write it down: **`http://192.168.1.50:3001`**

#### A7. GitHub self-hosted runner (auto-deploy)

On App Server:

1. GitHub → your repo → **Settings → Actions → Runners → New self-hosted runner**.
2. Choose **Windows**.
3. Run the commands GitHub shows (download runner, configure, start as service).
4. Label the runner: `financeos-lan` (must match workflow file).

Push workflow from Dev PC (already in repo): `.github/workflows/deploy-lan-selfhosted.yml`

5. **No extra deploy task required.** On push to `main`, Actions syncs `C:\FinanceOS\app` with `GITHUB_TOKEN`, then runs `Invoke-GithubActionsDeploy.ps1` (SYSTEM scheduled task if registered, else inline build/migrate/restart).

Optional (Admin, once — improves NSSM restart from Actions): `Register-GithubDeployTasks.ps1` (also run from `Install-FinanceOSServer.ps1`).

Test: push to `main` → **Actions** → green → `C:\FinanceOS\logs\deploy.log` shows `deploy OK`.

#### A8. Scheduled backup

```powershell
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Register-BackupTask.ps1
```

#### A9. Optional: poll deploy every 5 minutes (backup if runner fails)

```powershell
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Register-PollDeployTask.ps1
```

#### A10. Disable sleep on App Server

**Settings → System → Power → Sleep → Never** (when plugged in).

---

### Part B — Development PC (Cursor)

#### B1. Keep your existing clone

Continue working in `C:\Users\muhammad.shabraz\finance-manager`.

#### B2. Point optional dev UI at App Server

```powershell
copy frontend\.env.local.example frontend\.env.local
notepad frontend\.env.local
```

Set:

```
VITE_API_URL=http://192.168.1.50:3001/api
```

(`192.168.1.50` = App Server IP.)

#### B3. Daily workflow

```powershell
# Edit in Cursor, then:
git add .
git commit -m "describe change"
git push origin main
# Wait ~1–3 min — App Server deploys automatically
# Test: http://192.168.1.50:3001
```

#### B4. Stop running the “real” app locally

- Do not run `start.bat` / `START-LAN.bat` for production use.
- Local `backend\data\finance.db` becomes **backup/archive only**.

---

### Part C — Phone / tablet

1. Connect to **same Wi‑Fi**.
2. Open browser: `http://192.168.1.50:3001`
3. Log in with your password.
4. Optional: add to home screen (PWA-style bookmark).

---

## 10. Commands, scripts, and configs

### Files in this repo

| File | Purpose |
|------|---------|
| `.env.server.example` | App Server environment template |
| `scripts/windows/Install-FinanceOSServer.ps1` | One-time server setup |
| `scripts/windows/Deploy-FinanceOS.ps1` | Deploy + rollback |
| `scripts/windows/Install-FinanceOSService.ps1` | NSSM Windows service |
| `scripts/windows/Register-BackupTask.ps1` | Daily backup task |
| `scripts/windows/Register-PollDeployTask.ps1` | Optional git poll deploy |
| `scripts/windows/Start-FinanceOSTunnel.ps1` | New Cloudflare quick tunnel + update `.env` |
| `.github/workflows/deploy-lan-selfhosted.yml` | Push-to-deploy |

### Manual commands (App Server)

```powershell
# Deploy now (same as runner)
powershell -ExecutionPolicy Bypass -File C:\FinanceOS\app\scripts\windows\Deploy-FinanceOS.ps1

# Backup
cd C:\FinanceOS\app
node scripts\backup-db.mjs

# Restart service
nssm restart FinanceOS

# Service status
nssm status FinanceOS

# View deploy log
Get-Content C:\FinanceOS\logs\deploy.log -Tail 50
```

### Generate session secret

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

---

## 11. Lowest-maintenance solution

| Priority | Do this |
|----------|---------|
| **Must** | App Server + `C:\FinanceOS\data` + NSSM service + firewall |
| **Must** | GitHub self-hosted runner → auto deploy on push |
| **Must** | Daily backup scheduled task |
| **Should** | Never sleep on App Server; Private Wi‑Fi profile |
| **Optional** | Poll deploy task (redundant with runner) |
| **Skip** | Watched folder on server (use Import in browser) |
| **Skip** | Running app on Dev PC |

**Expected maintenance:** near zero — reboots recover via service; updates via `git push`; backups automatic.

---

## Related docs

- [OPEN-BANKING-MULTI-USER.md](OPEN-BANKING-MULTI-USER.md) — restricted mode and multiple FinanceOS users
- [TUNNEL-RECOVERY.md](TUNNEL-RECOVERY.md) — **Cloudflare quick tunnel died / new URL after restart**
- [CLOUD-MIGRATION.md](CLOUD-MIGRATION.md) — internet hosting (Oracle VM)
- [GIT-BEGINNER-GUIDE.md](GIT-BEGINNER-GUIDE.md) — Git basics
- [DATABASE.md](DATABASE.md) — backups and migrations
- [LAN.md](LAN.md) — original LAN notes
