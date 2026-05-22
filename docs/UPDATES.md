# Updating FinanceOS safely

Git updates change **application code**. Your **personal data** stays in `backend/data/` and is never overwritten by `git pull`.

## Update checklist

1. **Backup**

   ```powershell
   npm run db:backup -- --label before-update
   ```

2. **Stop the app** (close backend / LAN window).

3. **Pull latest code**

   ```powershell
   git pull
   ```

4. **Install dependencies** (if `package.json` changed)

   ```powershell
   npm run setup
   ```

5. **Run migrations**

   ```powershell
   npm run db:migrate
   ```

6. **Start the app**

   ```powershell
   npm run dev
   ```
   or `start.bat` / `START-LAN.bat`

7. **Smoke test**

   ```powershell
   npm test
   ```

8. Open the app and spot-check Dashboard / Investments.

## What will NOT be lost on pull

- `backend/data/finance.db`
- `.env`
- `backend/data/backups/`
- Imported transactions (they are inside the DB)
- Login password in `auth.json`

## What CAN change

- New UI features
- New API routes
- New DB tables/columns (via migrations)
- Default categories (only on **empty** DB — seed does not wipe your data)

## If something breaks

See [GIT-WORKFLOW.md — Rollback](GIT-WORKFLOW.md#rollback) and restore your backup:

```powershell
npm run db:restore -- --latest --yes
```

To roll back **code only** (keep database):

```powershell
git log --oneline -10
git checkout <commit-hash-before-update>
```

Or return to latest after fixing:

```powershell
git checkout main
```
