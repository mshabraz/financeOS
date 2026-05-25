/**
 * Shared expenses — standalone group/trip cost splitting (not mixed with personal finance).
 */
const express = require('express');
const repo = require('../services/sharedExpenses/repository');

const router = express.Router();

router.get('/events', (_req, res) => {
  try {
    res.json(repo.listEvents());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', (req, res) => {
  try {
    const { name, currency, notes, eventDate } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(repo.createEvent({ name, currency, notes, eventDate }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events/:id', (req, res) => {
  const data = repo.getEvent(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'Event not found' });
  const summary = repo.computeSummary(data.event.id);
  const settlement = repo.getSettlement(data.event.id);
  res.json({ ...data, summary, settlement });
});

router.patch('/events/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!repo.getEvent(id)) return res.status(404).json({ error: 'Event not found' });
  try {
    res.json(repo.updateEvent(id, req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/events/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!repo.getEvent(id)) return res.status(404).json({ error: 'Event not found' });
  repo.deleteEvent(id);
  res.json({ ok: true });
});

router.get('/events/:id/summary', (req, res) => {
  const summary = repo.computeSummary(Number(req.params.id));
  if (!summary) return res.status(404).json({ error: 'Event not found' });
  res.json(summary);
});

router.get('/events/:id/settlement', (req, res) => {
  const settlement = repo.getSettlement(Number(req.params.id));
  if (!settlement) return res.status(404).json({ error: 'Event not found' });
  res.json(settlement);
});

router.post('/events/:id/participants', (req, res) => {
  const eventId = Number(req.params.id);
  if (!repo.getEvent(eventId)) return res.status(404).json({ error: 'Event not found' });
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    res.status(201).json(repo.addParticipant(eventId, name));
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Participant already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/participants/:id', (req, res) => {
  try {
    const row = repo.updateParticipant(Number(req.params.id), req.body.name);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/participants/:id', (req, res) => {
  repo.deleteParticipant(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/events/:id/participants/import', (req, res) => {
  const targetId = Number(req.params.id);
  const sourceEventId = Number(req.body?.sourceEventId);
  if (!sourceEventId) return res.status(400).json({ error: 'sourceEventId is required' });
  try {
    const result = repo.importParticipantsFromEvent(targetId, sourceEventId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/events/:id/settlement/settled', (req, res) => {
  const eventId = Number(req.params.id);
  if (!repo.getEvent(eventId)) return res.status(404).json({ error: 'Event not found' });
  try {
    const { transfers, fromParticipantId, toParticipantId, amount, settled } = req.body;
    if (Array.isArray(transfers) && transfers.length > 0) {
      return res.json(repo.setTransfersSettledBatch(eventId, transfers, settled !== false));
    }
    if (!fromParticipantId || !toParticipantId || amount == null) {
      return res.status(400).json({ error: 'fromParticipantId, toParticipantId, and amount are required' });
    }
    repo.setTransferSettled(
      eventId,
      Number(fromParticipantId),
      Number(toParticipantId),
      Number(amount),
      settled !== false
    );
    res.json(repo.getSettlement(eventId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/events/:id/expenses', (req, res) => {
  const eventId = Number(req.params.id);
  if (!repo.getEvent(eventId)) return res.status(404).json({ error: 'Event not found' });
  try {
    res.status(201).json(repo.upsertExpense(eventId, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/expenses/:id', (req, res) => {
  const expenseId = Number(req.params.id);
  const db = require('../db/database').getDb();
  const exp = db.prepare('SELECT * FROM shared_expenses WHERE id = ?').get(expenseId);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  try {
    res.json(repo.upsertExpense(exp.event_id, req.body, expenseId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/expenses/:id', (req, res) => {
  repo.deleteExpense(Number(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
