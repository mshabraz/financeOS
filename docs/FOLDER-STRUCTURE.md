# Folder structure

```
finance-manager/                 ← Git repository root
├── .env.example                 ← Config template (copy to .env)
├── .env.production.example      ← Server/Docker template
├── .gitignore                   ← What Git must never upload
├── package.json                 ← Root scripts (setup, backup, dev)
│
├── backend/                     ← Node.js API + database
│   ├── src/
│   │   ├── index.js             ← Server entry
│   │   ├── config.js            ← Reads .env
│   │   ├── db/
│   │   │   ├── database.js      ← SQLite (sql.js)
│   │   │   └── schema.js        ← Migrations v1–v20+
│   │   ├── routes/              ← REST API
│   │   └── services/            ← Import, investments, analytics
│   ├── data/                    ← LOCAL ONLY (gitignored)
│   │   ├── finance.db           ← Your data
│   │   ├── auth.json            ← Login hash
│   │   └── backups/             ← npm run db:backup
│   └── logs/                    ← Runtime logs (gitignored)
│
├── frontend/                    ← React + Vite UI
│   └── src/
│       ├── pages/               ← Dashboard, Import, Investments…
│       └── components/
│
├── scripts/                     ← Setup, migrate, backup, certs
├── docker/                      ← Optional Docker deployment
├── docs/                        ← Documentation (in Git)
├── examples/                    ← Safe sample files only
├── config/                      ← Optional local overrides template
│
├── start.bat                    ← Windows: backend + frontend
├── START-LAN.bat                ← Windows: single-port LAN mode
└── README.md
```

## What Git tracks vs what stays local

| In Git | On your PC only |
|--------|------------------|
| Source code | `backend/data/finance.db` |
| `.env.example` | `.env` |
| Migrations in `schema.js` | `auth.json`, session secret |
| Docs, Docker files | CSV bank exports you import |
| `examples/` placeholders | `backend/logs/`, `node_modules/` |

Pulling updates from GitHub **does not** replace your database or `.env`.
