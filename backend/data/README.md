# Local data directory (not in Git)

This folder holds **your personal data** on this computer. It is listed in `.gitignore` so Git never uploads it to GitHub.

| File / folder | Purpose |
|---------------|---------|
| `finance.db` | SQLite database (transactions, investments, settings) |
| `auth.json` | Login password hash (if auth is enabled) |
| `.session-secret` | Auto-generated session signing key |
| `certs/` | HTTPS certificates (`npm run certs` from project root) |
| `backups/` | Database backups created by `npm run db:backup` |

## Fresh install

On first run, the app creates `finance.db` and applies migrations from `backend/src/db/schema.js`.

## Before updating the app

Run from the project root:

```bash
npm run db:backup
```

See [docs/DATABASE.md](../../docs/DATABASE.md) and [docs/UPDATES.md](../../docs/UPDATES.md).
