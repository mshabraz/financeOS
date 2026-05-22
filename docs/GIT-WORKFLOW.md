# Git workflow

A simple workflow for a solo developer or small household install.

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable version you run day-to-day |
| `develop` | Optional: experiments before merging to `main` |
| `feature/...` | Short-lived work (e.g. `feature/investments-chart`) |

For personal use, staying on `main` is fine. Use a branch when trying risky changes.

## Day-to-day

```powershell
git status                  # what changed?
git pull                    # get updates from GitHub
npm run setup               # if dependencies changed
npm run db:migrate
```

## Making changes

```powershell
git checkout -b feature/my-change
# edit files, test locally
git add .
git commit -m "Add short description of why"
git push -u origin feature/my-change
```

Merge on GitHub via Pull Request, or locally:

```powershell
git checkout main
git merge feature/my-change
git push
```

## Commit message conventions

Use clear, present-tense messages:

| Prefix | When |
|--------|------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Tooling, deps, gitignore |
| `refactor:` | Code change, same behavior |

Examples:

- `feat: add Swedbank fund country look-through`
- `fix: portfolio chart flat line on 1Y range`
- `docs: add Git beginner guide`

## Schema updates safely

1. Add a new `MIGRATION_V21` block in `backend/src/db/schema.js`.
2. Append it to `ALL_MIGRATIONS` in the same file.
3. Test on a copy of your DB: backup → migrate → verify.
4. Commit **only** the migration code — never `finance.db`.

## Rollback

### Code rollback (keep your data)

```powershell
npm run db:backup -- --label before-rollback
git log --oneline -15
git checkout abc1234    # commit before the bad update
# test the app
```

Return to newest code:

```powershell
git checkout main
git pull
```

### Data rollback

```powershell
npm run db:restore -- --latest --yes
```

### Nuclear option (code + empty DB)

Only if you want a clean slate:

```powershell
git checkout main
git pull
del backend\data\finance.db
npm run db:migrate
```

## Never commit

- `.env`
- `backend/data/finance.db`
- Real CSV exports
- `node_modules/`
- `backend/logs/`

`.gitignore` blocks these; if `git status` shows them, do not `git add` them.
