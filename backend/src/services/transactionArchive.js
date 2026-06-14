/**
 * Soft-delete archive for transaction cleanup with restore support.
 */

const crypto = require('crypto');

function splitTxnIds(ids = []) {
  const bankIds = [];
  const revolutIds = [];
  for (const raw of ids) {
    const s = String(raw);
    if (s.startsWith('r')) {
      const n = parseInt(s.slice(1), 10);
      if (!Number.isNaN(n)) revolutIds.push(n);
    } else {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) bankIds.push(n);
    }
  }
  return { bankIds, revolutIds };
}

function archiveBankRow(db, row, meta = {}) {
  const tags = db.prepare(
    `SELECT tag_id FROM transaction_tags WHERE transaction_id = ?`,
  ).all(row.id);

  const restoreToken = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO transaction_archive
      (ledger, original_id, row_json, tags_json, deleted_by, duplicate_group_id, restore_token)
    VALUES ('bank', ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    JSON.stringify(row),
    JSON.stringify(tags),
    meta.deletedBy || 'duplicate_cleanup',
    meta.groupId || null,
    restoreToken,
  );
  return restoreToken;
}

function archiveRevolutRow(db, row, meta = {}) {
  const tags = db.prepare(
    `SELECT tag_id FROM revolut_transaction_tags WHERE revolut_transaction_id = ?`,
  ).all(row.id);

  const restoreToken = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO transaction_archive
      (ledger, original_id, row_json, tags_json, deleted_by, duplicate_group_id, restore_token)
    VALUES ('revolut', ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    JSON.stringify(row),
    JSON.stringify(tags),
    meta.deletedBy || 'duplicate_cleanup',
    meta.groupId || null,
    restoreToken,
  );
  return restoreToken;
}

function copyBankTagsToKeeper(db, fromId, toId) {
  db.prepare(`
    INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
    SELECT ?, tag_id FROM transaction_tags WHERE transaction_id = ?
  `).run(toId, fromId);
}

function copyRevolutTagsToKeeper(db, fromId, toId) {
  db.prepare(`
    INSERT OR IGNORE INTO revolut_transaction_tags (revolut_transaction_id, tag_id)
    SELECT ?, tag_id FROM revolut_transaction_tags WHERE revolut_transaction_id = ?
  `).run(toId, fromId);
}

function mergeNotes(keeperNotes, donorNotes) {
  if (!donorNotes) return keeperNotes;
  if (!keeperNotes) return donorNotes;
  if (keeperNotes.includes(donorNotes)) return keeperNotes;
  return `${keeperNotes}\n---\n${donorNotes}`;
}

function mergeIntoKeeper(db, keepUnifiedId, removeUnifiedIds) {
  const { bankIds: keepBank, revolutIds: keepRev } = splitTxnIds([keepUnifiedId]);
  const { bankIds: remBank, revolutIds: remRev } = splitTxnIds(removeUnifiedIds);

  const restoreTokens = [];

  const run = db.transaction(() => {
    for (const id of remBank) {
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      if (!row) continue;
      restoreTokens.push(archiveBankRow(db, row));

      if (keepBank.length) {
        copyBankTagsToKeeper(db, id, keepBank[0]);
        const keeper = db.prepare('SELECT notes FROM transactions WHERE id = ?').get(keepBank[0]);
        const merged = mergeNotes(keeper?.notes, row.notes);
        if (merged !== keeper?.notes) {
          db.prepare('UPDATE transactions SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run(merged, keepBank[0]);
        }
      }
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    }

    for (const id of remRev) {
      const row = db.prepare('SELECT * FROM revolut_transactions WHERE id = ?').get(id);
      if (!row) continue;
      restoreTokens.push(archiveRevolutRow(db, row));

      if (keepRev.length) {
        copyRevolutTagsToKeeper(db, id, keepRev[0]);
        const keeper = db.prepare('SELECT notes FROM revolut_transactions WHERE id = ?').get(keepRev[0]);
        const merged = mergeNotes(keeper?.notes, row.notes);
        if (merged !== keeper?.notes) {
          db.prepare('UPDATE revolut_transactions SET notes = ? WHERE id = ?').run(merged, keepRev[0]);
        }
      }
      db.prepare('DELETE FROM revolut_transactions WHERE id = ?').run(id);
    }
  });

  run();
  return { removed: remBank.length + remRev.length, restoreTokens };
}

function restoreFromArchive(db, restoreTokens) {
  let restored = 0;
  const run = db.transaction(() => {
    for (const token of restoreTokens) {
      const arch = db.prepare(
        'SELECT * FROM transaction_archive WHERE restore_token = ?',
      ).get(token);
      if (!arch) continue;

      const row = JSON.parse(arch.row_json);
      const tags = JSON.parse(arch.tags_json || '[]');

      if (arch.ledger === 'bank') {
        const cols = Object.keys(row).filter((k) => k !== 'id');
        const placeholders = cols.map(() => `@${k}`).join(',');
        const colNames = cols.join(',');
        db.prepare(`INSERT INTO transactions (${colNames}) VALUES (${placeholders})`).run(row);
        const newId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        for (const t of tags) {
          db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)')
            .run(newId, t.tag_id);
        }
      } else {
        const cols = Object.keys(row).filter((k) => k !== 'id');
        const placeholders = cols.map(() => `@${k}`).join(',');
        const colNames = cols.join(',');
        db.prepare(`INSERT INTO revolut_transactions (${colNames}) VALUES (${placeholders})`).run(row);
        const newId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        for (const t of tags) {
          db.prepare('INSERT OR IGNORE INTO revolut_transaction_tags (revolut_transaction_id, tag_id) VALUES (?, ?)')
            .run(newId, t.tag_id);
        }
      }

      db.prepare('DELETE FROM transaction_archive WHERE id = ?').run(arch.id);
      restored++;
    }
  });
  run();
  return { restored };
}

function listRecentArchive(db, limit = 50) {
  return db.prepare(`
    SELECT id, ledger, original_id, deleted_at, deleted_by, duplicate_group_id, restore_token,
           json_extract(row_json, '$.date') AS date,
           json_extract(row_json, '$.amount') AS amount,
           json_extract(row_json, '$.merchant') AS merchant,
           json_extract(row_json, '$.description') AS description
    FROM transaction_archive
    ORDER BY deleted_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  mergeIntoKeeper,
  restoreFromArchive,
  listRecentArchive,
  archiveBankRow,
  archiveRevolutRow,
};
