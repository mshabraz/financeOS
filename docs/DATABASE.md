# Database & migrations

FinanceOS uses **SQLite** per user account:

```
backend/data/users/<user-id>/finance.db
backend/data/users-registry.json   # accounts (email, roles — no transaction data)
```

Legacy single-user installs are migrated automatically on first server start. Only schema **migrations** (code in `backend/src/db/schema.js`) are versioned in Git. All files under `backend/data/` are **gitignored**.

## How migrations work

1. Each schema change is a numbered migration (`v1`, `v2`, … through **v26** as of FinanceOS 1.0.1).
2. On server start, `runMigrations()` applies any migration not yet recorded in `schema_migrations`.
3. You can also run migrations manually:

```powershell
npm run db:migrate
npm run db:status
```

A fresh install creates an empty database, runs all migrations, then seeds default categories.

**Note:** Migration v26 is a no-op (archived wealth goals are kept). If your database was upgraded with an older v26 that deleted non-active goals, restore from backup to recover that history.

## Backups

**Before every update** from Git:

```powershell
npm run db:backup
```

Backups are stored under:

```
backend/data/backups/<timestamp>/
  users/                  # per-account databases
  users-registry.json
  .session-secret
  manifest.json
  (legacy: finance.db, auth.json if present)
```

Optional label:

```powershell
npm run db:backup -- --label before-may-update
```

## Restore

1. **Stop** the app (close backend terminal).
2. List backups: `npm run db:restore` (no arguments).
3. Restore:

```powershell
npm run db:restore -- 2026-05-20T12-00-00 --yes
npm run db:restore -- --latest --yes
```

4. Start the app and run `npm run db:migrate`.

Your previous files are renamed to `*.pre-restore-<timestamp>` before overwrite.

## Reset (empty database)

Only if you want to start over:

1. Stop the app.
2. Run `npm run db:backup` (safety copy).
3. Delete `backend/data/finance.db`.
4. Start the app — migrations recreate tables; default categories are seeded.

## Docker

Docker uses a named volume `financeos-data` mounted at `/data`. Back up the volume or copy `finance.db` from the container before upgrades.
