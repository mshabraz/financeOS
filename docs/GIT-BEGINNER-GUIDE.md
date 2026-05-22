# Git & GitHub — complete beginner guide

This guide assumes you have **never used Git**. Follow the steps in order.

---

## Step 1: Install Git

### Windows

1. Open https://git-scm.com/download/win
2. Download and run the installer.
3. Accept the defaults (including **“Git from the command line”**).
4. Open **PowerShell** or **Command Prompt**.
5. Check it works:

```powershell
git --version
```

You should see something like `git version 2.x.x`.

### Mac

Install Xcode Command Line Tools, or Homebrew:

```bash
brew install git
git --version
```

---

## Step 2: Create a GitHub account

1. Go to https://github.com/signup
2. Choose a username, email, and password.
3. Verify your email if GitHub asks.
4. Sign in — you now have a place to store your project online (a **remote repository**).

---

## Step 3: Create a repository on GitHub

1. Click the **+** menu (top right) → **New repository**.
2. **Repository name:** `finance-manager` (or any name you like).
3. **Description:** optional, e.g. “Personal finance app”.
4. Choose **Private** (recommended — personal finance project).
5. **Do not** check “Add a README” if you already have the project on your PC — you will upload your existing folder.
6. Click **Create repository**.

GitHub shows a page with commands — keep it open for Step 6.

---

## Step 4: Initialize Git in the project

Open PowerShell and go to your project folder:

```powershell
cd C:\Users\muhammad.shabraz\finance-manager
```

Tell Git who you are (once per computer):

```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Start Git in this folder:

```powershell
git init
```

You should see: `Initialized empty Git repository`.

Check what Git sees:

```powershell
git status
```

You should see many **untracked** files (normal). You should **not** see `finance.db` or `.env` if `.gitignore` is working.

---

## Step 5: First commit

A **commit** is a saved snapshot of your project code.

### Stage files (tell Git what to include)

```powershell
git add .
```

### Review (optional but recommended)

```powershell
git status
```

Confirm these are **not** listed:

- `backend/data/finance.db`
- `.env`
- `node_modules/`

If `finance.db` appears, **stop** — do not commit it. Ask for help fixing `.gitignore`.

### Create the commit

```powershell
git commit -m "Initial commit: FinanceOS local finance manager"
```

---

## Step 6: Push to GitHub

Link your local folder to the GitHub repo (replace `YOUR_USERNAME`):

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/finance-manager.git
git push -u origin main
```

### First-time login

GitHub no longer accepts account passwords in the terminal. Use one of:

- **GitHub CLI:** `winget install GitHub.cli` then `gh auth login`
- **Personal Access Token:** GitHub → Settings → Developer settings → Personal access tokens → create token with `repo` scope → use token as password when `git push` asks

After success, refresh your repo page on GitHub — you should see your files.

---

## Step 7: How to pull future updates

When you (or someone else) change the project on GitHub and you want those changes on your PC:

```powershell
cd C:\Users\muhammad.shabraz\finance-manager
git pull
```

Then follow [UPDATES.md](UPDATES.md) (`npm run setup`, `npm run db:migrate`, restart app).

**`git pull` does not delete your database** — it only updates code files tracked in Git.

---

## Step 8: Safely update the app without losing data

Your data lives in **`backend/data/`**, which Git ignores.

### Every time you update

| Step | Action |
|------|--------|
| 1 | `npm run db:backup` |
| 2 | Stop the app |
| 3 | `git pull` |
| 4 | `npm run setup` (if dependencies changed) |
| 5 | `npm run db:migrate` |
| 6 | Start app (`start.bat` or `npm run dev`) |

### Files that stay on your machine forever (unless you delete them)

- `backend/data/finance.db`
- `.env`
- `backend/data/backups/`

### Files that update from GitHub

- `backend/src/...` (code)
- `frontend/src/...` (UI)
- `docs/`, scripts, etc.

---

## Step 9: Roll back if an update breaks something

### Option A — Restore your data (most common)

If the app starts but data looks wrong, or migrations failed:

```powershell
# Stop the app first
npm run db:restore
# Note the folder name listed, then:
npm run db:restore -- YOUR-BACKUP-FOLDER --yes
npm run db:migrate
```

### Option B — Restore older code (keep database)

```powershell
npm run db:backup -- --label before-rollback
git log --oneline -10
```

Pick the commit **before** the bad update (left hash):

```powershell
git checkout abc1234def
```

Test the app. When ready to try latest code again:

```powershell
git checkout main
git pull
```

### Option C — Undo last commit locally (only if you have NOT pushed yet)

```powershell
git reset --soft HEAD~1
```

### Option D — Re-clone from GitHub (code fresh, keep data separately)

1. Copy entire `backend/data` folder somewhere safe.
2. Clone repo to a new folder.
3. Run `npm run setup`.
4. Copy your `backend/data` back.
5. `npm run db:migrate`

---

## Quick reference

| I want to… | Command |
|------------|---------|
| See changes | `git status` |
| Save a snapshot | `git add .` then `git commit -m "message"` |
| Upload to GitHub | `git push` |
| Download from GitHub | `git pull` |
| Backup database | `npm run db:backup` |
| Restore database | `npm run db:restore -- --latest --yes` |

---

## More detail

- [GIT-WORKFLOW.md](GIT-WORKFLOW.md) — branches, commit style, schema rules
- [UPDATES.md](UPDATES.md) — update checklist
- [DATABASE.md](DATABASE.md) — migrations and backups
