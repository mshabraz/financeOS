# FinanceOS — Local-First Personal Finance Manager

A fully local personal finance manager for **LHV Bank**, **Revolut**, **Lightyear**, and **Swedbank** fund imports.
No cloud subscriptions — your data stays in SQLite on your machine.

---

## Features

- **CSV import** — LHV, Revolut, Lightyear, Swedbank funds
- **Duplicate detection** — safe re-imports
- **Auto-categorization** — rules engine (Estonian merchants, etc.)
- **Dashboard & analytics** — trends, budgets, investments
- **LAN access** — phones/tablets on your Wi‑Fi ([docs/LAN.md](docs/LAN.md))
- **Dark mode**
- **Git-ready** — local DB and secrets never committed ([docs/GETTING-STARTED.md](docs/GETTING-STARTED.md))

---

## Requirements

- **Node.js 18+** — https://nodejs.org
- **Git** (optional, for updates from GitHub)

---

## Quick start

```powershell
cd finance-manager
npm run setup
npm run dev
```

Open **http://localhost:5173**

**Windows:** `start.bat` (dev) or `START-LAN.bat` (phone-friendly single port).

---

## Documentation

| Topic | Guide |
|-------|--------|
| Install & run | [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) |
| Folder layout | [docs/FOLDER-STRUCTURE.md](docs/FOLDER-STRUCTURE.md) |
| Database & backups | [docs/DATABASE.md](docs/DATABASE.md) |
| Safe updates | [docs/UPDATES.md](docs/UPDATES.md) |
| Git for beginners | [docs/GIT-BEGINNER-GUIDE.md](docs/GIT-BEGINNER-GUIDE.md) |
| Git workflow | [docs/GIT-WORKFLOW.md](docs/GIT-WORKFLOW.md) |
| LAN / HTTPS | [docs/LAN.md](docs/LAN.md) |
| **Cloud hosting (free)** | [docs/CLOUD-MIGRATION.md](docs/CLOUD-MIGRATION.md) |
| **Second PC on home Wi‑Fi (LAN server)** | [docs/LAN-SERVER.md](docs/LAN-SERVER.md) |

<!-- deploy-test: 2026-05-22 -->

---

## NPM scripts (project root)

| Script | Purpose |
|--------|---------|
| `npm run setup` | Install deps + create `.env` |
| `npm run dev` | Backend + frontend (dev) |
| `npm run start:lan` | Production-style LAN server |
| `npm run build` | Build frontend for production |
| `npm run db:migrate` | Apply SQLite migrations |
| `npm run db:backup` | Backup DB + auth |
| `npm run db:restore` | Restore from backup |
| `npm test` | Smoke tests |
| `npm run docker:up` | Docker Compose |

---

## Configuration

Copy `.env.example` → `.env` (created automatically by `npm run setup`).

| File | Committed to Git? |
|------|-------------------|
| `.env.example` | Yes (template) |
| `.env` | **No** (your machine) |
| `backend/data/finance.db` | **No** |

Production template: `.env.production.example`

---

## Project structure (short)

```
finance-manager/
├── backend/          API + SQLite (data in backend/data/)
├── frontend/         React UI
├── scripts/          setup, backup, migrate
├── docker/           optional container deploy
└── docs/             guides
```

Full tree: [docs/FOLDER-STRUCTURE.md](docs/FOLDER-STRUCTURE.md)

---

## Database

- File: `backend/data/finance.db` (gitignored)
- Migrations: `backend/src/db/schema.js` (in Git)
- Backup before updates: `npm run db:backup`

Reset (empty DB): delete `finance.db` and restart — see [docs/DATABASE.md](docs/DATABASE.md).

---

## Logs

`backend/logs/combined.log` and `error.log` (gitignored).

---

## Docker

```powershell
cd docker
docker compose up --build
```

Data volume: `financeos-data`. See `docker/docker-compose.yml`.

---

## License

Private / personal use unless you add a license file.
