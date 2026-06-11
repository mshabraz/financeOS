const express = require('express');
const { getDb } = require('../db/database');
const { invalidateCache, applyRuleToExisting, applyAllRulesToExisting } = require('../services/categorizer');
const logger = require('../services/logger');

const router = express.Router();

// GET /api/categories
router.get('/', (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT * FROM categories ORDER BY type, name').all();
  res.json(cats);
});

// POST /api/categories
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, icon = '📦', color = '#94a3b8', type = 'expense' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db
      .prepare('INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)')
      .run(name, icon, color, type);

    res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    logger.error('[POST /categories]', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/categories/:id
router.patch('/:id', (req, res) => {
  const db = getDb();
  const { name, icon, color, type } = req.body;
  const id = req.params.id;

  const fields = [];
  const vals   = [];
  if (name  !== undefined) { fields.push('name = ?');  vals.push(name); }
  if (icon  !== undefined) { fields.push('icon = ?');  vals.push(icon); }
  if (color !== undefined) { fields.push('color = ?'); vals.push(color); }
  if (type  !== undefined) { fields.push('type = ?');  vals.push(type); }

  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  vals.push(id);
  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...vals);

  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
});

// DELETE /api/categories/:id  — reassigns transactions to Uncategorized
router.delete('/:id', (req, res) => {
  const db = getDb();
  const def = db.prepare('SELECT id FROM categories WHERE is_default = 1').get();
  db.prepare('UPDATE transactions SET category_id = ? WHERE category_id = ?').run(def?.id, req.params.id);
  db.prepare('UPDATE revolut_transactions SET category_id = ? WHERE category_id = ?').run(def?.id, req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ? AND is_default = 0').run(req.params.id);
  res.json({ ok: true });
});

// --- Category Rules ---

// GET /api/categories/rules
router.get('/rules/all', (req, res) => {
  const db = getDb();
  const rules = db
    .prepare(
      `SELECT r.*, c.name as category_name FROM category_rules r
       JOIN categories c ON c.id = r.category_id
       ORDER BY r.priority DESC, r.hit_count DESC`
    )
    .all();
  res.json(rules);
});

// POST /api/categories/rules
// Body: { pattern, matchField, categoryId, priority, isRegex,
//         applyNow=true, overrideManual=false }
// When applyNow is true (default), the new rule is immediately applied to all
// existing transactions so the user sees the effect of the rule right away.
router.post('/rules', (req, res) => {
  try {
    const db = getDb();
    const {
      pattern, matchField = 'merchant', categoryId,
      priority = 50, isRegex = false,
      applyNow = true, overrideManual = false,
    } = req.body;
    if (!pattern || !categoryId) return res.status(400).json({ error: 'pattern and categoryId required' });

    const result = db
      .prepare(
        'INSERT INTO category_rules (pattern, match_field, category_id, priority, is_regex, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(pattern, matchField, parseInt(categoryId), parseInt(priority), isRegex ? 1 : 0, 'user');

    invalidateCache();

    let applied = { matched: 0, updated: 0 };
    if (applyNow) {
      applied = applyRuleToExisting(result.lastInsertRowid, { overrideManual });
    }

    const rule = db.prepare('SELECT * FROM category_rules WHERE id = ?').get(result.lastInsertRowid);
    res.json({ rule, applied });
  } catch (err) {
    logger.error('[POST /categories/rules]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories/rules/apply-all
router.post('/rules/apply-all', (req, res) => {
  try {
    const { overrideManual = false } = req.body || {};
    const result = applyAllRulesToExisting({ overrideManual });
    res.json(result);
  } catch (err) {
    logger.error('[POST /categories/rules/apply-all]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories/rules/:id/apply
// Re-run an existing rule against the current database. Use after editing a
// rule, or to backfill historical data when a rule was created without applyNow.
// Body: { overrideManual?: boolean }
router.post('/rules/:id/apply', (req, res) => {
  try {
    const { overrideManual = false } = req.body || {};
    const result = applyRuleToExisting(parseInt(req.params.id), { overrideManual });
    res.json(result);
  } catch (err) {
    logger.error('[POST /categories/rules/:id/apply]', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/categories/rules/:id — update priority, disable, etc.
router.patch('/rules/:id', (req, res) => {
  const db = getDb();
  const { priority, is_disabled, confidence } = req.body;
  const fields = [];
  const vals   = [];
  if (priority    !== undefined) { fields.push('priority = ?');    vals.push(parseInt(priority)); }
  if (is_disabled !== undefined) { fields.push('is_disabled = ?'); vals.push(parseInt(is_disabled)); }
  if (confidence  !== undefined) { fields.push('confidence = ?');  vals.push(parseFloat(confidence)); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE category_rules SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  invalidateCache();
  res.json(db.prepare('SELECT * FROM category_rules WHERE id = ?').get(req.params.id));
});

// DELETE /api/categories/rules/:id
router.delete('/rules/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM category_rules WHERE id = ?').run(req.params.id);
  invalidateCache();
  res.json({ ok: true });
});

module.exports = router;
