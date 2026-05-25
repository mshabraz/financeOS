/**
 * Database schema and migration system.
 * All SQLite tables are created here with versioned migrations.
 */

const migrations = [
  // v1 - Initial schema
  {
    version: 1,
    // (existing schema — not repeated here, already applied)
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          fingerprint       TEXT    NOT NULL UNIQUE,       -- SHA-256 hash for dedup
          account           TEXT    NOT NULL,              -- IBAN source account
          date              TEXT    NOT NULL,              -- ISO date: YYYY-MM-DD
          beneficiary       TEXT,                          -- Beneficiary/Payer name (raw)
          merchant          TEXT,                          -- Normalized merchant name
          details           TEXT,                          -- Raw details/description
          amount            REAL    NOT NULL,              -- Positive = income, negative = expense
          currency          TEXT    NOT NULL DEFAULT 'EUR',
          direction         TEXT    NOT NULL,              -- 'D' debit | 'K' credit
          transfer_ref      TEXT,                          -- Transfer reference number
          transaction_type  TEXT,                          -- MK=bank transfer, K=card, etc.
          reference_number  TEXT,
          document_number   TEXT,
          category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          category_source   TEXT    DEFAULT 'auto',        -- 'auto' | 'manual' | 'rule'
          notes             TEXT,
          created_at        TEXT    DEFAULT (datetime('now')),
          updated_at        TEXT    DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_date       ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_transactions_category   ON transactions(category_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_direction  ON transactions(direction);
        CREATE INDEX IF NOT EXISTS idx_transactions_merchant   ON transactions(merchant);

        CREATE TABLE IF NOT EXISTS categories (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT NOT NULL UNIQUE,
          icon        TEXT,                -- emoji icon
          color       TEXT,                -- hex color
          type        TEXT NOT NULL,       -- 'expense' | 'income' | 'transfer'
          is_default  INTEGER DEFAULT 0,
          created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS category_rules (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          pattern       TEXT    NOT NULL,  -- substring or regex pattern to match
          match_field   TEXT    NOT NULL,  -- 'merchant' | 'beneficiary' | 'details'
          is_regex      INTEGER DEFAULT 0,
          category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          priority      INTEGER DEFAULT 0, -- higher = checked first
          hit_count     INTEGER DEFAULT 0, -- how many times this rule matched
          created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS import_sessions (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          filename        TEXT NOT NULL,
          imported_count  INTEGER DEFAULT 0,
          duplicate_count INTEGER DEFAULT 0,
          skipped_count   INTEGER DEFAULT 0,
          error_count     INTEGER DEFAULT 0,
          account         TEXT,
          date_from       TEXT,
          date_to         TEXT,
          created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS budgets (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          month       TEXT NOT NULL,       -- YYYY-MM
          amount      REAL NOT NULL,
          created_at  TEXT DEFAULT (datetime('now')),
          UNIQUE(category_id, month)
        );

        CREATE TABLE IF NOT EXISTS schema_migrations (
          version   INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);
    },
  },
];

const DEFAULT_CATEGORIES = [
  // Expenses
  { name: 'Groceries',       icon: '🛒', color: '#22c55e', type: 'expense' },
  { name: 'Restaurants',     icon: '🍽️', color: '#f97316', type: 'expense' },
  { name: 'Coffee & Cafes',  icon: '☕', color: '#a78bfa', type: 'expense' },
  { name: 'Transport',       icon: '🚗', color: '#3b82f6', type: 'expense' },
  { name: 'Subscriptions',   icon: '📺', color: '#ec4899', type: 'expense' },
  { name: 'Health & Fitness',icon: '💪', color: '#06b6d4', type: 'expense' },
  { name: 'Utilities',       icon: '💡', color: '#eab308', type: 'expense' },
  { name: 'Accommodation',   icon: '🏠', color: '#84cc16', type: 'expense' },
  { name: 'Entertainment',   icon: '🎭', color: '#f43f5e', type: 'expense' },
  { name: 'Wellness & Spa',  icon: '🧖', color: '#c084fc', type: 'expense' },
  { name: 'Pension',         icon: '🏦', color: '#64748b', type: 'savings' },
  { name: 'Investments',     icon: '📈', color: '#6366f1', type: 'savings' },
  { name: 'Phone & Internet',icon: '📱', color: '#0ea5e9', type: 'expense' },
  { name: 'Shopping',        icon: '🛍️', color: '#fb923c', type: 'expense' },
  { name: 'Other Expenses',  icon: '💸', color: '#94a3b8', type: 'expense' },
  // Income
  { name: 'Salary',          icon: '💼', color: '#10b981', type: 'income' },
  { name: 'Other Income',    icon: '💰', color: '#34d399', type: 'income' },
  // Transfers
  { name: 'Transfers',       icon: '🔄', color: '#6366f1', type: 'transfer' },
  { name: 'Uncategorized',   icon: '❓', color: '#cbd5e1', type: 'expense', is_default: 1 },
];

// Patterns tuned for Estonian/LHV bank exports
const DEFAULT_RULES = [
  // Income
  { pattern: 'REMUNERATION',          field: 'details',     category: 'Salary',           priority: 100 },
  { pattern: 'PALK',                  field: 'details',     category: 'Salary',           priority: 100 },
  { pattern: 'SALARY',                field: 'details',     category: 'Salary',           priority: 100 },

  // Transfers
  { pattern: 'Wise',                  field: 'beneficiary', category: 'Transfers',         priority: 90 },
  { pattern: 'PENSIONIKESKUS',        field: 'beneficiary', category: 'Pension',           priority: 90 },

  // Utilities / Phone
  { pattern: 'ELISA',                 field: 'beneficiary', category: 'Phone & Internet',  priority: 80 },
  { pattern: 'TELIA',                 field: 'beneficiary', category: 'Phone & Internet',  priority: 80 },
  { pattern: 'EESTI ENERGIA',         field: 'beneficiary', category: 'Utilities',         priority: 80 },

  // Subscriptions / Streaming
  { pattern: 'HBOMAX',                field: 'merchant',    category: 'Subscriptions',     priority: 80 },
  { pattern: 'HBO',                   field: 'merchant',    category: 'Subscriptions',     priority: 70 },
  { pattern: 'NETFLIX',               field: 'merchant',    category: 'Subscriptions',     priority: 80 },
  { pattern: 'SPOTIFY',               field: 'merchant',    category: 'Subscriptions',     priority: 80 },
  { pattern: 'APPLE.COM',             field: 'merchant',    category: 'Subscriptions',     priority: 80 },
  { pattern: 'GOOGLE',                field: 'merchant',    category: 'Subscriptions',     priority: 60 },

  // Restaurants
  { pattern: 'RESTORAN',              field: 'merchant',    category: 'Restaurants',       priority: 80 },
  { pattern: 'RESTAURANT',           field: 'merchant',    category: 'Restaurants',       priority: 80 },
  { pattern: 'KAMIKADZE',            field: 'merchant',    category: 'Restaurants',       priority: 80 },
  { pattern: 'Alpokami',             field: 'merchant',    category: 'Restaurants',       priority: 80 },
  { pattern: 'NYA*',                  field: 'merchant',    category: 'Restaurants',       priority: 70 },
  { pattern: 'PIZZA',                 field: 'merchant',    category: 'Restaurants',       priority: 70 },
  { pattern: 'BURGER',                field: 'merchant',    category: 'Restaurants',       priority: 70 },

  // Coffee
  { pattern: 'COFFEE',                field: 'merchant',    category: 'Coffee & Cafes',    priority: 80 },
  { pattern: 'CAFE',                  field: 'merchant',    category: 'Coffee & Cafes',    priority: 70 },
  { pattern: 'KOHVIK',                field: 'merchant',    category: 'Coffee & Cafes',    priority: 80 },

  // Groceries
  { pattern: 'SELVER',                field: 'merchant',    category: 'Groceries',         priority: 80 },
  { pattern: 'RIMI',                  field: 'merchant',    category: 'Groceries',         priority: 80 },
  { pattern: 'MAXIMA',                field: 'merchant',    category: 'Groceries',         priority: 80 },
  { pattern: 'PRISMA',                field: 'merchant',    category: 'Groceries',         priority: 80 },
  { pattern: 'R-KIOSK',               field: 'merchant',    category: 'Groceries',         priority: 70 },
  { pattern: 'OPIKU MAJA',            field: 'merchant',    category: 'Groceries',         priority: 70 },

  // Transport
  { pattern: 'BOLT',                  field: 'merchant',    category: 'Transport',         priority: 80 },
  { pattern: 'UBER',                  field: 'merchant',    category: 'Transport',         priority: 80 },
  { pattern: 'TALLINNA BUSSIJAAM',    field: 'merchant',    category: 'Transport',         priority: 80 },
  { pattern: 'BRISA',                 field: 'merchant',    category: 'Transport',         priority: 80 },
  { pattern: 'PARKING',               field: 'merchant',    category: 'Transport',         priority: 70 },

  // Health & Fitness
  { pattern: 'MY FITNESS',            field: 'merchant',    category: 'Health & Fitness',  priority: 80 },
  { pattern: 'SPORDIKLUBI',           field: 'merchant',    category: 'Health & Fitness',  priority: 80 },
  { pattern: 'APOTHEKA',              field: 'merchant',    category: 'Health & Fitness',  priority: 80 },
  { pattern: 'BENU',                  field: 'merchant',    category: 'Health & Fitness',  priority: 80 },

  // Accommodation
  { pattern: 'airbnb',                field: 'details',     category: 'Accommodation',     priority: 80 },
  { pattern: 'AIRBNB',                field: 'merchant',    category: 'Accommodation',     priority: 80 },
  { pattern: 'BOOKING',               field: 'merchant',    category: 'Accommodation',     priority: 80 },

  // Wellness & Spa
  { pattern: 'ELAMUSSPA',             field: 'merchant',    category: 'Wellness & Spa',    priority: 80 },
  { pattern: 'SPA',                   field: 'merchant',    category: 'Wellness & Spa',    priority: 60 },

  // Entertainment
  { pattern: 'HOOKAH',                field: 'merchant',    category: 'Entertainment',     priority: 80 },
  { pattern: 'CINEMA',                field: 'merchant',    category: 'Entertainment',     priority: 80 },
  { pattern: 'KINO',                  field: 'merchant',    category: 'Entertainment',     priority: 80 },
];

// v2 migration — bank balance tracking + manual asset balances
const MIGRATION_V2 = {
  version: 2,
  up: (db) => {
    db.exec(`
      -- Stores closing/opening balances extracted from CSV row types 10 and 86
      CREATE TABLE IF NOT EXISTS account_balances (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        account          TEXT    NOT NULL,
        balance_type     TEXT    NOT NULL,   -- 'opening' | 'closing'
        amount           REAL    NOT NULL,
        currency         TEXT    NOT NULL DEFAULT 'EUR',
        balance_date     TEXT    NOT NULL,   -- ISO date
        import_session_id INTEGER,
        created_at       TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_account_balances_date
        ON account_balances(account, balance_date DESC);

      -- User-managed asset balances (pension, investments, etc.)
      CREATE TABLE IF NOT EXISTS manual_balances (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        key        TEXT    NOT NULL UNIQUE,   -- 'pension' | 'investments' | custom
        label      TEXT    NOT NULL,
        icon       TEXT    DEFAULT '💰',
        amount     REAL    NOT NULL DEFAULT 0,
        currency   TEXT    DEFAULT 'EUR',
        updated_at TEXT    DEFAULT (datetime('now'))
      );
    `);

    // Seed default manual balance slots
    db.prepare(
      "INSERT OR IGNORE INTO manual_balances (key, label, icon, amount) VALUES (?, ?, ?, ?)"
    ).run('pension',      'Pension Savings',   '🏦', 0);
    db.prepare(
      "INSERT OR IGNORE INTO manual_balances (key, label, icon, amount) VALUES (?, ?, ?, ?)"
    ).run('investments',  'Investments',       '📈', 0);
  },
};

// ── Migration v3: Tagging system ─────────────────────────────────────────────
const MIGRATION_V3 = {
  version: 3,
  up: (db) => {
    db.exec(`
      -- Tags are independent labels that can cross categories
      CREATE TABLE IF NOT EXISTS tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        color       TEXT    DEFAULT '#6366f1',
        description TEXT,
        created_at  TEXT    DEFAULT (datetime('now'))
      );

      -- Many-to-many: transactions ↔ tags
      CREATE TABLE IF NOT EXISTS transaction_tags (
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        tag_id         INTEGER NOT NULL REFERENCES tags(id)         ON DELETE CASCADE,
        created_at     TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (transaction_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tx_tags_tag ON transaction_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_tx_tags_tx  ON transaction_tags(transaction_id);

      -- Merchant normalization map: raw merchant → canonical name
      CREATE TABLE IF NOT EXISTS merchant_aliases (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_pattern    TEXT    NOT NULL UNIQUE,  -- regex or substring
        canonical_name TEXT    NOT NULL,
        is_regex       INTEGER DEFAULT 0,
        created_at     TEXT    DEFAULT (datetime('now'))
      );

      -- Enhanced rule tracking: last matched date + confidence + disabled flag
      ALTER TABLE category_rules ADD COLUMN last_matched TEXT;
      ALTER TABLE category_rules ADD COLUMN confidence   REAL DEFAULT 1.0;
      ALTER TABLE category_rules ADD COLUMN is_disabled  INTEGER DEFAULT 0;
      ALTER TABLE category_rules ADD COLUMN created_by   TEXT DEFAULT 'system'; -- 'system'|'user'|'learning'
    `);
  },
};

// ── Migration v4: Investment tracking ────────────────────────────────────────
const MIGRATION_V4 = {
  version: 4,
  up: (db) => {
    db.exec(`
      -- Raw investment transactions from broker CSV (LightYear format)
      CREATE TABLE IF NOT EXISTS investment_transactions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint    TEXT    NOT NULL UNIQUE,
        reference      TEXT,
        datetime       TEXT    NOT NULL,          -- ISO datetime: YYYY-MM-DDTHH:MM:SS
        date           TEXT    NOT NULL,          -- ISO date: YYYY-MM-DD
        ticker         TEXT,
        isin           TEXT,
        type           TEXT    NOT NULL,          -- Buy|Sell|Dividend|Deposit|Withdrawal|Conversion|Interest|Refund
        quantity       REAL,
        currency       TEXT    NOT NULL DEFAULT 'EUR',
        price_per_share REAL,
        gross_amount   REAL,
        fx_rate        REAL,
        fee            REAL    DEFAULT 0,
        net_amount     REAL    NOT NULL,
        tax_amount     REAL    DEFAULT 0,
        notes          TEXT,
        created_at     TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_inv_date   ON investment_transactions(date);
      CREATE INDEX IF NOT EXISTS idx_inv_ticker ON investment_transactions(ticker);
      CREATE INDEX IF NOT EXISTS idx_inv_type   ON investment_transactions(type);

      -- Import sessions for investment CSV
      CREATE TABLE IF NOT EXISTS investment_import_sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        filename        TEXT    NOT NULL,
        imported_count  INTEGER DEFAULT 0,
        duplicate_count INTEGER DEFAULT 0,
        error_count     INTEGER DEFAULT 0,
        created_at      TEXT    DEFAULT (datetime('now'))
      );
    `);
  },
};

// ── Migration v5: Multi-broker investment support ─────────────────────────────
const MIGRATION_V5 = {
  version: 5,
  up: (db) => {
    db.exec(`
      -- Broker registry: one row per connected broker/account
      CREATE TABLE IF NOT EXISTS investment_brokers (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        key          TEXT    NOT NULL UNIQUE,   -- 'lightyear' | 'swedbank_fund' | ...
        name         TEXT    NOT NULL,
        account_id   TEXT,                       -- broker account number/ID
        currency     TEXT    DEFAULT 'EUR',
        description  TEXT,
        created_at   TEXT    DEFAULT (datetime('now'))
      );

      -- Import file history with parser metadata
      CREATE TABLE IF NOT EXISTS investment_file_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        filename        TEXT    NOT NULL,
        broker_key      TEXT    NOT NULL,
        broker_name     TEXT    NOT NULL,
        parser_version  TEXT    DEFAULT '1.0',
        detected_conf   REAL    DEFAULT 1.0,    -- parser detection confidence 0-1
        imported_count  INTEGER DEFAULT 0,
        duplicate_count INTEGER DEFAULT 0,
        skipped_count   INTEGER DEFAULT 0,
        error_count     INTEGER DEFAULT 0,
        date_from       TEXT,
        date_to         TEXT,
        warnings        TEXT,                    -- JSON array of warning strings
        created_at      TEXT    DEFAULT (datetime('now'))
      );
    `);

    // Add broker + metadata columns to existing investment_transactions
    // SQLite only supports ADD COLUMN, one at a time
    const existingCols = db.prepare("PRAGMA table_info(investment_transactions)").all().map((r) => r.name);

    const alterCols = [
      ['broker',            "TEXT NOT NULL DEFAULT 'lightyear'"],
      ['broker_account_id', 'TEXT'],
      ['fund_name',         'TEXT'],
      ['fund_order_id',     'TEXT'],
      ['raw_details',       'TEXT'],
      ['raw_type',          'TEXT'],
      ['settlement_date',   'TEXT'],
      ['file_history_id',   'INTEGER'],
    ];

    for (const [col, def] of alterCols) {
      if (!existingCols.includes(col)) {
        db.exec(`ALTER TABLE investment_transactions ADD COLUMN ${col} ${def}`);
      }
    }

    // Add broker column to import sessions too
    const sessionCols = db.prepare("PRAGMA table_info(investment_import_sessions)").all().map((r) => r.name);
    if (!sessionCols.includes('broker')) {
      db.exec("ALTER TABLE investment_import_sessions ADD COLUMN broker TEXT DEFAULT 'lightyear'");
    }

    // Seed known brokers
    db.prepare("INSERT OR IGNORE INTO investment_brokers (key, name, description, currency) VALUES (?, ?, ?, ?)")
      .run('lightyear',     'LightYear',             'LightYear.io stock & ETF broker', 'EUR');
    db.prepare("INSERT OR IGNORE INTO investment_brokers (key, name, description, currency) VALUES (?, ?, ?, ?)")
      .run('swedbank_fund', 'Swedbank Investment',    'Swedbank mutual fund investment account', 'EUR');

    // Create index on broker column
    db.exec('CREATE INDEX IF NOT EXISTS idx_inv_broker ON investment_transactions(broker)');
  },
};

// ── Migration v6: Revolut statements (isolated from bank `transactions`) ─────
const MIGRATION_V6 = {
  version: 6,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS revolut_import_sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        filename         TEXT    NOT NULL,
        import_source    TEXT    NOT NULL DEFAULT 'revolut_csv',
        imported_count   INTEGER DEFAULT 0,
        duplicate_count  INTEGER DEFAULT 0,
        skipped_count    INTEGER DEFAULT 0,
        product          TEXT,
        date_from        TEXT,
        date_to          TEXT,
        created_at       TEXT    DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS revolut_transactions (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint        TEXT    NOT NULL UNIQUE,
        revolut_type       TEXT,
        product            TEXT,
        started_datetime   TEXT,
        completed_datetime TEXT,
        date               TEXT    NOT NULL,
        description        TEXT,
        amount             REAL    NOT NULL,
        fee                REAL    DEFAULT 0,
        currency           TEXT    NOT NULL DEFAULT 'EUR',
        state              TEXT,
        balance_after      REAL,
        raw_balance        TEXT,
        import_source      TEXT    NOT NULL DEFAULT 'revolut_csv',
        import_session_id  INTEGER REFERENCES revolut_import_sessions(id) ON DELETE SET NULL,
        created_at         TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_revolut_date ON revolut_transactions(date DESC);
      CREATE INDEX IF NOT EXISTS idx_revolut_type  ON revolut_transactions(revolut_type);
      CREATE INDEX IF NOT EXISTS idx_revolut_desc  ON revolut_transactions(description);

      CREATE TABLE IF NOT EXISTS revolut_transaction_tags (
        revolut_transaction_id INTEGER NOT NULL REFERENCES revolut_transactions(id) ON DELETE CASCADE,
        tag_id                 INTEGER NOT NULL REFERENCES tags(id)         ON DELETE CASCADE,
        created_at             TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (revolut_transaction_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rev_tags_tag ON revolut_transaction_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_rev_tags_tx  ON revolut_transaction_tags(revolut_transaction_id);
    `);
  },
};

// ── Migration v7: User notes on Revolut rows (bank + investments already have `notes`) ──
const MIGRATION_V7 = {
  version: 7,
  up: (db) => {
    const cols = db.prepare('PRAGMA table_info(revolut_transactions)').all().map((r) => r.name);
    if (!cols.includes('notes')) {
      db.exec('ALTER TABLE revolut_transactions ADD COLUMN notes TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_revolut_notes ON revolut_transactions(notes)');
  },
};

// ── Migration v8: Revolut effective amounts + unified analytics ───────────────
const MIGRATION_V8 = {
  version: 8,
  up: (db) => {
    const cols = db.prepare('PRAGMA table_info(revolut_transactions)').all().map((r) => r.name);
    const addCol = (name, def) => {
      if (!cols.includes(name)) {
        db.exec(`ALTER TABLE revolut_transactions ADD COLUMN ${name} ${def}`);
      }
    };
    addCol('effective_amount', 'REAL');
    addCol('split_ratio', 'REAL');
    addCol('exclude_from_analytics', 'INTEGER NOT NULL DEFAULT 0');
    addCol('applies_shared_split', 'INTEGER NOT NULL DEFAULT 0');

    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.prepare(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('revolut_expense_split_ratio', '0.5')"
    ).run();

    const { backfillRevolutAmounts } = require('../services/revolutCalculations');
    backfillRevolutAmounts(db);

    db.exec('CREATE INDEX IF NOT EXISTS idx_revolut_effective ON revolut_transactions(effective_amount)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_revolut_exclude ON revolut_transactions(exclude_from_analytics)');
  },
};

// ── Migration v9: Revolut categories (same as bank transactions) ─────────────
const MIGRATION_V9 = {
  version: 9,
  up: (db) => {
    const cols = db.prepare('PRAGMA table_info(revolut_transactions)').all().map((r) => r.name);
    if (!cols.includes('category_id')) {
      db.exec('ALTER TABLE revolut_transactions ADD COLUMN category_id INTEGER REFERENCES categories(id)');
    }
    if (!cols.includes('category_source')) {
      db.exec("ALTER TABLE revolut_transactions ADD COLUMN category_source TEXT DEFAULT 'auto'");
    }
    const def = db.prepare('SELECT id FROM categories WHERE is_default = 1 LIMIT 1').get();
    if (def?.id) {
      db.prepare(
        'UPDATE revolut_transactions SET category_id = ?, category_source = COALESCE(category_source, ?) WHERE category_id IS NULL'
      ).run(def.id, 'auto');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_revolut_category ON revolut_transactions(category_id)');
  },
};

// ── Migration v10: Pension / Investment as savings (not consumption expenses) ─
const MIGRATION_V10 = {
  version: 10,
  up: (db) => {
    db.prepare(
      "UPDATE categories SET type = 'savings' WHERE LOWER(name) IN ('pension', 'investments', 'investment')"
    ).run();
    const hasInvestments = db.prepare(
      "SELECT id FROM categories WHERE LOWER(name) IN ('investments', 'investment') LIMIT 1"
    ).get();
    if (!hasInvestments) {
      db.prepare(
        "INSERT INTO categories (name, icon, color, type) VALUES ('Investments', '📈', '#6366f1', 'savings')"
      ).run();
    }
  },
};

// ── Migration v11: Market prices & security bindings for investments ─────────
const MIGRATION_V11 = {
  version: 11,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_securities (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        local_ticker    TEXT,
        yahoo_symbol    TEXT NOT NULL UNIQUE,
        name            TEXT,
        exchange        TEXT,
        isin            TEXT,
        quote_currency  TEXT NOT NULL DEFAULT 'USD',
        security_type   TEXT,
        provider        TEXT NOT NULL DEFAULT 'yahoo',
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS holding_security_bindings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        holding_key     TEXT NOT NULL UNIQUE,
        broker          TEXT NOT NULL,
        ticker          TEXT NOT NULL,
        currency        TEXT NOT NULL DEFAULT 'EUR',
        isin            TEXT,
        security_id     INTEGER REFERENCES market_securities(id) ON DELETE SET NULL,
        binding_source  TEXT NOT NULL DEFAULT 'auto',
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now')),
        UNIQUE(broker, ticker, currency)
      );

      CREATE TABLE IF NOT EXISTS market_prices (
        security_id     INTEGER PRIMARY KEY REFERENCES market_securities(id) ON DELETE CASCADE,
        price           REAL NOT NULL DEFAULT 0,
        currency        TEXT NOT NULL,
        fetched_at      TEXT NOT NULL,
        source          TEXT NOT NULL DEFAULT 'yahoo',
        error           TEXT
      );

      CREATE TABLE IF NOT EXISTS market_price_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        security_id     INTEGER NOT NULL REFERENCES market_securities(id) ON DELETE CASCADE,
        price           REAL NOT NULL,
        currency        TEXT NOT NULL,
        price_date      TEXT NOT NULL,
        fetched_at      TEXT NOT NULL,
        source          TEXT NOT NULL DEFAULT 'yahoo',
        UNIQUE(security_id, price_date)
      );

      CREATE TABLE IF NOT EXISTS investment_price_sync (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),
        status              TEXT NOT NULL DEFAULT 'idle',
        last_started_at     TEXT,
        last_success_at     TEXT,
        last_error          TEXT,
        securities_updated  INTEGER DEFAULT 0,
        holdings_checked    INTEGER DEFAULT 0
      );

      INSERT OR IGNORE INTO investment_price_sync (id, status) VALUES (1, 'idle');

      CREATE INDEX IF NOT EXISTS idx_bindings_broker ON holding_security_bindings(broker);
      CREATE INDEX IF NOT EXISTS idx_securities_isin ON market_securities(isin);
      CREATE INDEX IF NOT EXISTS idx_price_history_sec ON market_price_history(security_id, price_date);
    `);
  },
};

// ── Migration v12: Manual investment cash (optional, user-entered) ─────────────
const MIGRATION_V12 = {
  version: 12,
  up: (db) => {
    db.prepare(
      "INSERT OR IGNORE INTO manual_balances (key, label, icon, amount, currency) VALUES (?, ?, ?, ?, ?)"
    ).run('investment_cash', 'Investment Cash', '💵', 0, 'EUR');
  },
};

// ── Migration v13: Manual quantity for fund holdings (e.g. Swedbank) ───────────
const MIGRATION_V13 = {
  version: 13,
  up: (db) => {
    const cols = db.prepare('PRAGMA table_info(holding_security_bindings)').all();
    if (!cols.some((c) => c.name === 'manual_quantity')) {
      db.exec('ALTER TABLE holding_security_bindings ADD COLUMN manual_quantity REAL');
    }
  },
};

// ── Migration v14: Manual avg cost per share (e.g. Swedbank funds) ─────────────
const MIGRATION_V14 = {
  version: 14,
  up: (db) => {
    const cols = db.prepare('PRAGMA table_info(holding_security_bindings)').all();
    if (!cols.some((c) => c.name === 'manual_avg_cost_per_share')) {
      db.exec('ALTER TABLE holding_security_bindings ADD COLUMN manual_avg_cost_per_share REAL');
    }
  },
};

// ── Migration v15: Security metadata + daily change on quotes ─────────────────
const MIGRATION_V15 = {
  version: 15,
  up: (db) => {
    const secCols = db.prepare('PRAGMA table_info(market_securities)').all();
    const addSec = (name, type) => {
      if (!secCols.some((c) => c.name === name)) {
        db.exec(`ALTER TABLE market_securities ADD COLUMN ${name} ${type}`);
      }
    };
    addSec('sector', 'TEXT');
    addSec('industry', 'TEXT');
    addSec('country', 'TEXT');
    addSec('region', 'TEXT');
    addSec('asset_class', 'TEXT');
    addSec('metadata_updated_at', 'TEXT');

    const priceCols = db.prepare('PRAGMA table_info(market_prices)').all();
    const addPrice = (name, type) => {
      if (!priceCols.some((c) => c.name === name)) {
        db.exec(`ALTER TABLE market_prices ADD COLUMN ${name} ${type}`);
      }
    };
    addPrice('previous_close', 'REAL');
    addPrice('change_amount', 'REAL');
    addPrice('change_percent', 'REAL');
    addPrice('dividend_yield', 'REAL');
  },
};

// ── Migration v16: Watched-folder auto-import registry ───────────────────────
const MIGRATION_V16 = {
  version: 16,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS watched_import_files (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name        TEXT NOT NULL,
        file_path        TEXT,
        file_hash        TEXT NOT NULL UNIQUE,
        file_size        INTEGER,
        import_kind      TEXT NOT NULL,
        parser_type      TEXT,
        status           TEXT NOT NULL,
        new_count        INTEGER DEFAULT 0,
        duplicate_count  INTEGER DEFAULT 0,
        error_count      INTEGER DEFAULT 0,
        skipped_count    INTEGER DEFAULT 0,
        session_table    TEXT,
        session_id       INTEGER,
        error_message    TEXT,
        warnings_json    TEXT,
        first_seen_at    TEXT DEFAULT (datetime('now')),
        processed_at     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_watched_import_status ON watched_import_files(status);
      CREATE INDEX IF NOT EXISTS idx_watched_import_processed ON watched_import_files(processed_at);
    `);
    db.prepare(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('watched_folder_enabled', 'false')"
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('watched_folder_path', '')"
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('watched_scan_interval_sec', '60')"
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('watched_use_fs_watch', 'true')"
    ).run();
  },
};

// ── Migration v17: Dedupe investment txs by broker reference (Lightyear etc.) ─
const MIGRATION_V17 = {
  version: 17,
  up: (db) => {
    const { dedupeInvestmentTransactionsByReference } = require('../services/investmentDedup');
    const { removed, fingerprintsUpdated } = dedupeInvestmentTransactionsByReference(db);
    if (removed > 0 || fingerprintsUpdated > 0) {
      console.log(
        `[Migration v17] Investment dedupe: removed ${removed} duplicate row(s), updated ${fingerprintsUpdated} fingerprint(s)`
      );
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_broker_reference
        ON investment_transactions(broker, reference)
        WHERE reference IS NOT NULL AND TRIM(reference) != '';
    `);
  },
};

// ── Migration v18: Per-broker investment cash ───────────────────────────────────
const MIGRATION_V18 = {
  version: 18,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS investment_broker_cash (
        broker     TEXT PRIMARY KEY,
        amount     REAL NOT NULL DEFAULT 0,
        currency   TEXT NOT NULL DEFAULT 'EUR',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const legacy = db
      .prepare("SELECT amount, currency FROM manual_balances WHERE key = 'investment_cash'")
      .get();
    if (legacy && (legacy.amount || 0) > 0) {
      db.prepare(
        `INSERT INTO investment_broker_cash (broker, amount, currency)
         VALUES ('lightyear', ?, ?)
         ON CONFLICT(broker) DO UPDATE SET
           amount = excluded.amount,
           currency = excluded.currency`
      ).run(legacy.amount, legacy.currency || 'EUR');
    }
    db.prepare(
      "INSERT OR IGNORE INTO investment_broker_cash (broker, amount, currency) VALUES ('lightyear', 0, 'EUR')"
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO investment_broker_cash (broker, amount, currency) VALUES ('swedbank_fund', 0, 'EUR')"
    ).run();
  },
};

// ── Migration v19: Cache ETF/fund geographic breakdown ─────────────────────────
const MIGRATION_V19 = {
  version: 19,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fund_allocation_cache (
        yahoo_symbol  TEXT PRIMARY KEY,
        payload_json  TEXT NOT NULL,
        updated_at    TEXT DEFAULT (datetime('now'))
      );
    `);
    /* Listing exchange ≠ geographic exposure for UCITS ETFs */
    db.exec(`
      UPDATE market_securities
      SET country = NULL
      WHERE asset_class IN ('ETF', 'Fund', 'Mutual Fund')
        AND (
          (yahoo_symbol LIKE '%.L' AND country = 'United Kingdom')
          OR (yahoo_symbol LIKE '%.DE' AND country = 'Germany')
          OR (yahoo_symbol LIKE '%.ST' AND country = 'Sweden')
          OR (yahoo_symbol LIKE '%.HE' AND country = 'Finland')
        );
    `);
  },
};

// ── Migration v20: Commodity ETCs — no listing-country geographic tag ───────────
const MIGRATION_V20 = {
  version: 20,
  up: (db) => {
    db.exec(`
      UPDATE market_securities
      SET country = NULL, region = NULL, sector = 'Commodities', asset_class = 'Commodity'
      WHERE UPPER(local_ticker) IN ('PPFB', 'PPFD')
         OR UPPER(yahoo_symbol) LIKE 'PPFB.%'
         OR UPPER(yahoo_symbol) LIKE 'PPFD.%'
         OR LOWER(name) LIKE '%physical gold%'
         OR LOWER(name) LIKE '%physical silver%';
    `);
  },
};

// Keep in sync with migrations array below
// ── Migration v21: Shared expenses (standalone from personal finance) ───────────
const MIGRATION_V21 = {
  version: 21,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shared_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        currency    TEXT NOT NULL DEFAULT 'EUR',
        notes       TEXT,
        event_date  TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shared_participants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id    INTEGER NOT NULL REFERENCES shared_events(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(event_id, name)
      );

      CREATE TABLE IF NOT EXISTS shared_expenses (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id      INTEGER NOT NULL REFERENCES shared_events(id) ON DELETE CASCADE,
        description   TEXT NOT NULL,
        expense_date  TEXT,
        category      TEXT,
        notes         TEXT,
        split_type    TEXT NOT NULL DEFAULT 'equal_all',
        created_at    TEXT DEFAULT (datetime('now')),
        updated_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shared_expense_payments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id      INTEGER NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
        participant_id  INTEGER NOT NULL REFERENCES shared_participants(id) ON DELETE CASCADE,
        amount          REAL NOT NULL,
        UNIQUE(expense_id, participant_id)
      );

      CREATE TABLE IF NOT EXISTS shared_expense_shares (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id      INTEGER NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
        participant_id  INTEGER NOT NULL REFERENCES shared_participants(id) ON DELETE CASCADE,
        amount          REAL NOT NULL,
        UNIQUE(expense_id, participant_id)
      );

      CREATE INDEX IF NOT EXISTS idx_shared_participants_event ON shared_participants(event_id);
      CREATE INDEX IF NOT EXISTS idx_shared_expenses_event ON shared_expenses(event_id);
    `);
  },
};

// ── Migration v22: Shared settlement tracking ─────────────────────────────────
const MIGRATION_V22 = {
  version: 22,
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shared_settlement_settled (
        event_id              INTEGER NOT NULL REFERENCES shared_events(id) ON DELETE CASCADE,
        from_participant_id   INTEGER NOT NULL,
        to_participant_id     INTEGER NOT NULL,
        amount                REAL NOT NULL,
        settled_at            TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (event_id, from_participant_id, to_participant_id, amount)
      );
    `);
  },
};

const ALL_MIGRATIONS = [...migrations.filter(m => m.version === 1), MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6, MIGRATION_V7, MIGRATION_V8, MIGRATION_V9, MIGRATION_V10, MIGRATION_V11, MIGRATION_V12, MIGRATION_V13, MIGRATION_V14, MIGRATION_V15, MIGRATION_V16, MIGRATION_V17, MIGRATION_V18, MIGRATION_V19, MIGRATION_V20, MIGRATION_V21, MIGRATION_V22];

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  for (const migration of ALL_MIGRATIONS) {
    if (!applied.has(migration.version)) {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
      console.log(`[DB] Applied migration v${migration.version}`);
    }
  }
}

function seedDefaultData(db) {
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (catCount > 0) return;

  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (name, icon, color, type, is_default) VALUES (?, ?, ?, ?, ?)'
  );

  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO category_rules (pattern, match_field, category_id, priority)
    VALUES (?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const cat of DEFAULT_CATEGORIES) {
      insertCat.run(cat.name, cat.icon, cat.color, cat.type, cat.is_default ? 1 : 0);
    }

    const getCatId = db.prepare('SELECT id FROM categories WHERE name = ?');

    for (const rule of DEFAULT_RULES) {
      const cat = getCatId.get(rule.category);
      if (cat) {
        insertRule.run(rule.pattern, rule.field, cat.id, rule.priority);
      }
    }
  });

  seedAll();
  console.log('[DB] Seeded default categories and rules');
}

module.exports = { runMigrations, seedDefaultData };
