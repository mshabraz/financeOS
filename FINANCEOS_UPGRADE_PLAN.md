# FinanceOS: 3-Milestone Upgrade & Refactoring Master Plan

> **Document Status:** Active Engineering Specification · Feature Branch Cut  
> **Target Repo:** `https://github.com/mshabraz/financeOS`  
> **Active Branch:** `feature/v2-redesign-and-persistence`  
> **Production Instance:** Lenovo ThinkCentre Tiny (`192.168.1.26:8081` · `finance.home`)  
> **Revision:** 2.0 (Incorporates IndexedDB async persister, Docker stop grace period, synchronous WASM flush, and atomic rollback sequence)  

---

## 1. Architectural Strategy & Production Isolation

### 1.1 The Golden Rule: Production Continuity
The live production instance on the **HomeServer (`192.168.1.26:8081`) must remain online, fully functional, and untouched** while development, refactoring, and automated testing take place.

```
┌─────────────────────────────────────────────────────────────┐
│ HOMESERVER PRODUCTION (Untouched & Online)                  │
│                                                             │
│   Docker: financeos-financeos:v1.0-prod-freeze (Port 8081)  │
│   Data:   /srv/docker/financeos/data (Live SQLite DBs)      │
│   Branch: main (Frozen at commit 9189f0e)                   │
│   Proxy:  http://finance.home -> 127.0.0.1:8081             │
└─────────────────────────────────────────────────────────────┘
                               ▲
                 (ISOLATION BOUNDARY - NO TOUCH)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ LOCAL DEVELOPMENT ENVIRONMENT (Windows PC)                  │
│                                                             │
│   Branch: feature/v2-redesign-and-persistence               │
│   Repo:   C:\FinanceOS\app                                  │
│   Dev:    Vite Dev Server (Port 5173) + Isolated Backend     │
│   Data:   Isolated Sandbox Data (C:\FinanceOS\sandbox-data) │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Isolation Controls
1. **Branch Isolation:** A dedicated branch `feature/v2-redesign-and-persistence` is cut from `main`. All commits will remain on this branch until fully validated.
2. **Container Tag Freezing:** Before cutover, the active HomeServer production image is tagged as `financeos-financeos:v1.0-prod-freeze`.
3. **Database Sandboxing:** Development on Windows runs against an isolated sandbox database directory (`C:\FinanceOS\sandbox-data`), never touching production SQLite files.
4. **Zero Auto-Deployments:** The obsolete GitHub Actions workflow has been removed, ensuring pushes to GitHub will never trigger unexpected builds or resets on the HomeServer.

---

## 2. Pre-Flight Backup Protocol

Before any code modification or future cutover, execute these verifiable backup procedures:

### Step 2.1: HomeServer Live Database Backup
Run the automated backup script directly on the HomeServer:
```bash
ssh mshabraz@192.168.1.26 "/srv/docker/financeos/backup.sh pre-v2-upgrade"
```
* **Primary Target:** `/srv/docker/financeos/data/backups/<timestamp>_pre-v2-upgrade/`
* **Offsite Target:** `/mnt/HDD1/Downloads/financeos-backups/<timestamp>_pre-v2-upgrade.tgz`

### Step 2.2: HomeServer Raw Directory Snapshot
Create an uncompressed cold snapshot of the live data directory:
```bash
ssh mshabraz@192.168.1.26 "tar czf /srv/docker/financeos/data-snapshot-pre-v2.tar.gz -C /srv/docker/financeos data .env"
```

### Step 2.3: Production Docker Image Tagging
Freeze the current running production image so it can be restored in seconds:
```bash
ssh mshabraz@192.168.1.26 "docker tag financeos-financeos:latest financeos-financeos:v1.0-prod-freeze"
```

### Step 2.4: Local Codebase Snapshot
Create a local archive of the current repository state on Windows:
```powershell
Compress-Archive -Path "C:\FinanceOS\app" -DestinationPath "C:\FinanceOS\financeos-app-pre-v2-backup.zip"
```

---

## 3. Milestone 1: Persistence & URL State Architecture
**Objective:** Eliminate data, view, and filter resets on page refresh; ensure all navigation state is bookmarkable and shareable; harden SQLite disk flush.

* [ ] **1.1 IndexedDB Async Client Storage Middleware (Trap B Mitigation)**
  * Install: `npm install idb-keyval @tanstack/react-query-persist-client` in `frontend/`.
  * Create `frontend/src/lib/idbPersister.js`:
    * Implement `createAsyncStoragePersister` wrapping `idb-keyval` (IndexedDB).
    * Bypasses the strict **5 MB quota** of `localStorage` (avoids `QuotaExceededError`).
    * Runs asynchronously off the main thread.
  * In `frontend/src/main.jsx`:
    * Configure `persistQueryClient` with 24-hour cache lifespan.
    * Implement strict `shouldDehydrateQuery` predicate:
      * Dehydrate static metadata (categories, tags, user preferences, summary aggregates).
      * **Exclude unbounded transaction queries** (only dehydrate page 1 of transactions to avoid bloat).
      * Exclude session/auth queries (`authStatus`).

* [ ] **1.2 Resilient `useUrlQueryState` Hook (UX Recommendation)**
  * Create `frontend/src/hooks/useUrlQueryState.js`:
    * **Default Value Stripping:** Automatically removes query parameter when value matches default (`next.delete(key)`), keeping URLs clean and shareable without query bloat.
    * **History Discipline:**
      * Use `replace: true` for debounced text inputs (search bar, note filter) and sliders to prevent browser history pollution.
      * Use `replace: false` (push) for discrete navigation actions (page changes, tab switches, category filtering).
    * Custom type serializers (`String`, `Number`, `Boolean`, `Array`).

* [ ] **1.3 Refactor Page States to URL Query Parameters**
  * **`Transactions.jsx`:**
    * Migrate 12 view filters (`p` for page, `q` for search, `cat` for category, `dir` for direction, `from`/`to` for dates, `tag`, `src`, `notes`, `sort`, `order`) to `useUrlQueryState`.
  * **`Investments.jsx`:**
    * Synchronize active tab (`tab`), broker filter (`broker`), and timeframe (`period`) to URL params. Ensure switching tabs updates the URL query string.
  * **`Analytics.jsx`:**
    * Synchronize `presetId` (`preset`), `filterMonth` (`month`), and custom date ranges to URL params.
  * **`Dashboard.jsx`:**
    * Synchronize `periodType` and `periodValue` to URL params.
  * **`Categories.jsx` & `Obligations.jsx`:**
    * Synchronize rule tabs, search queries, and obligation status tabs.

* [ ] **1.4 Backend SQLite WASM Persistence Hardening (Trap A Mitigation)**
  * File: `backend/src/db/database.js`:
    * Expose `db.flushSync()` to immediately export in-memory SQLite buffer to disk via `fs.writeFileSync` + atomic rename.
    * Intercept process shutdown signals (`SIGTERM`, `SIGINT`) to guarantee pending debounce timers run synchronously before exit.
  * In write-heavy endpoints:
    * `backend/src/routes/transactions.js` (bulk categorize, delete, import)
    * `backend/src/routes/dashboard.js` (manual balance add/update/delete)
    * `backend/src/routes/settings.js` (Revolut split recalculation)
    * Execute `db.flushSync()` before returning `res.json(...)` to the client.
  * In `docker-compose.yml`:
    * Add `stop_grace_period: 15s` (extending default 10s) to guarantee ample time for file write completion before Docker issues `SIGKILL`.

---

## 4. Milestone 2: Design Token & Typography Refactoring
**Objective:** Elevate visual aesthetics above generic "AI boilerplate"; implement proper financial typography (`tabular-nums`); eliminate nested card clutter ("Cardception").

* [ ] **2.1 Comprehensive Design Token System**
  * File: `frontend/tailwind.config.js`:
    * Expand brand palette from 5 colors to a complete 11-step scale (`50` through `950`).
    * Introduce semantic surface color variables:
      * `--surface-subtle`: page background
      * `--surface-panel`: secondary container
      * `--surface-card`: primary content card
      * `--surface-border`: refined, low-contrast border
    * Add subtle, elevated shadows (`shadow-card`, `shadow-hover`) to replace aggressive 1px border lines.

* [ ] **2.2 Financial Typography & Global CSS Rules**
  * File: `frontend/src/index.css`:
    * Enable OpenType features: `font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'`.
    * Create utility `.tabular-nums`: `font-variant-numeric: tabular-nums lining-nums`.
    * Ensure all metric cards, table amounts, and balance summaries use `.tabular-nums`.

* [ ] **2.3 Standardized Financial Formatting Engine (Milestone 2 Recommendations)**
  * File: `frontend/src/utils/displayFormat.js`:
    * Create `formatFinancialValue(amount, options)`:
      * Enforce fixed 2 decimal places globally: `minimumFractionDigits: 2`, `maximumFractionDigits: 2` to prevent vertical decimal drift.
      * Explicit `signDisplay: 'always'` for credits/debits (`+€120.00` / `-€54.20`).
      * **Accessibility Enhancement:** Do not rely solely on red/green colors for direction. Pair color with explicit sign (`+` / `-`) and subtle semantic badge tokens for color-blind accessibility.
      * Seamless privacy masking integration (`maskIfPrivacy`).

* [ ] **2.4 De-Cluttering & Structural Flattening**
  * Audit all screens for nested `.card` containers.
  * Convert nested cards into clean semantic dividers or subtle tinted panels (`bg-surface-panel` without extra borders).
  * Standardize component padding and internal rhythm across mobile and desktop.

---

## 5. Milestone 3: UX Hardening & Micro-Interactions
**Objective:** Replace jarring loading spinners with skeletons; implement optimistic updates with rollbacks; replace raw browser alerts with accessible dialogs; build informative empty states.

* [ ] **3.1 Table & Metric Skeleton Loaders**
  * Create `frontend/src/components/ui/TableSkeleton.jsx` (configurable rows/cols with shimmer pulse).
  * Create `frontend/src/components/ui/StatCardSkeleton.jsx`.
  * Replace `<LoadingSpinner />` blocks in table bodies and metric grids to eliminate layout shift (CLS).

* [ ] **3.2 Optimistic Mutation Pipeline (Milestone 3 Recommendations)**
  * File: `frontend/src/pages/Transactions.jsx`:
    * In `onMutate`: **always call `await qc.cancelQueries({ queryKey: [...] })`** before snapshotting cache to prevent in-flight queries from overwriting optimistic updates.
    * Optimistic updates with rollback for:
      * Category changes (`updateCategoryMut`)
      * Note updates (`notesMut`)
      * Tag assignments/removals (`assignTagMut`, `removeTagMut`)
  * File: `frontend/src/pages/Dashboard.jsx`:
    * Optimistic updates for manual balance modifications.

* [ ] **3.3 Accessible Modal & Toast System**
  * Create `frontend/src/components/ui/ConfirmDialog.jsx`:
    * Replaces `window.confirm(...)` in `Dashboard.jsx`, `Categories.jsx`, etc.
    * Fully accessible, keyboard-trapped, dark-mode native dialog.
  * Create lightweight global toast notification system for feedback (e.g., "Transaction categorized. [Undo]").

* [ ] **3.4 Contextual Empty States**
  * Create `frontend/src/components/ui/EmptyState.jsx`:
    * Graphic icon, title, descriptive cause, and clear call-to-action button (e.g., "Clear filters" or "Import transactions").
    * Deploy across `Transactions.jsx`, `Investments.jsx`, `Obligations.jsx`, and `Categories.jsx`.

---

## 6. Verification & Testing Matrix

| Test Domain | Verification Procedure | Pass Criteria |
| :--- | :--- | :--- |
| **Refresh Persistence** | Apply 5 filters in Transactions, refresh page ($F5$). | Exact URL, page number, filters, and sorting remain active. |
| **URL Cleanliness** | Reset filters to defaults. | URL strips redundant default query params. |
| **History Navigation**| Type in search box, change page, press Browser Back button. | Back button navigates to previous page; does not step through every keystroke. |
| **Tab Navigation** | Switch to Investments -> Strategy tab, refresh page. | Page reloads directly on Strategy tab without defaulting to Overview. |
| **Cache Hydration** | Refresh Dashboard with browser offline simulation. | Cached balances and cards render instantly from IndexedDB without blank spinners. |
| **Tabular Alignment**| Inspect transaction table in Chrome DevTools. | All digits render with equal width; decimals align vertically to the pixel. |
| **Optimistic UX** | Change category on a slow 3G throttled connection. | Badge updates instantly; rolls back with toast if request fails. |
| **Process Crash Safety**| Trigger mutations and immediately issue container stop. | SQLite DB on disk reflects all committed mutations without corruption. |

---

## 7. Cutover & Rollback Protocols

### 7.1 Staging Cutover Protocol (When Ready)
1. Ensure all milestone changes are committed and tested on `feature/v2-redesign-and-persistence`.
2. Run full frontend build test: `npm run build` in `frontend/`.
3. Test production Docker build locally or on staging port:
   ```bash
   docker build -t financeos-financeos:v2-candidate -f docker/Dockerfile .
   ```
4. Merge feature branch into `main` and push to GitHub.
5. On the HomeServer, execute the safe deploy script:
   ```bash
   ssh mshabraz@192.168.1.26 "cd /srv/docker/financeos && ./deploy.sh"
   ```

### 7.2 Atomic Rollback Protocol (Trap C Mitigation)
If any regression occurs during cutover, execute the atomic sequence (**stop container first**, restore database, retag image, boot):
```bash
ssh mshabraz@192.168.1.26 "cd /srv/docker/financeos && \
  docker compose down && \
  tar xzf data-snapshot-pre-v2.tar.gz && \
  docker tag financeos-financeos:v1.0-prod-freeze financeos-financeos:latest && \
  docker compose up -d --no-build"
```
* **Why this sequence:** Stopping the container first releases SQLite file locks and prevents the database from being written to while tar extracts, eliminating file-locking and corruption risks.

---

## 8. Branch Management & Execution Workflow

```powershell
# 1. Switch to local repository
cd C:\FinanceOS\app

# 2. Verify git status is clean on main
git status

# 3. Create and switch to isolated milestone feature branch
git checkout -b feature/v2-redesign-and-persistence

# 4. Ready for execution of Milestone 1
```
