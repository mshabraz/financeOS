# Getting started with FinanceOS

FinanceOS is a **local-first** finance app: your data lives in `backend/data/finance.db` on your computer, not in the cloud.

## What you need

- **Git** (for updates from GitHub) — [install guide](GIT-BEGINNER-GUIDE.md#step-1-install-git)
- **Node.js 18+** — https://nodejs.org
- **Windows, Mac, or Linux**

## First install

### 1. Get the project

Clone from GitHub (after you have a repository), or unzip a release folder.

```powershell
cd C:\Users\YourName\projects
git clone https://github.com/YOUR_USERNAME/finance-manager.git
cd finance-manager
```

### 2. Run setup

```powershell
npm run setup
```

This installs backend and frontend dependencies and creates `.env` from `.env.example` if you do not have one yet.

### 3. Start the app

**Easiest (Windows):** double-click `start.bat`

**Or from the project folder:**

```powershell
npm run dev
```

Open **http://localhost:5173**

### 4. Import your data

1. Open **Import** (LHV bank CSV) or **Investments** (broker CSVs).
2. Drag your export file onto the upload area.
3. Review preview → confirm import.

Your database file is created automatically at `backend/data/finance.db`.

## LAN / phone access

Use `START-LAN.bat` or see [LAN.md](LAN.md).

## Daily commands

| Task | Command |
|------|---------|
| Start (dev) | `npm run dev` or `start.bat` |
| Start (LAN, one port) | `START-LAN.bat` or `npm run start:lan` |
| Backup database | `npm run db:backup` |
| Apply DB migrations | `npm run db:migrate` |
| Smoke test | `npm test` |

## Next reading

- [Folder structure](FOLDER-STRUCTURE.md)
- [Database & backups](DATABASE.md)
- [Safe updates](UPDATES.md)
- [Git for beginners](GIT-BEGINNER-GUIDE.md)
- [Git workflow](GIT-WORKFLOW.md)
