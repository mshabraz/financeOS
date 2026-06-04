const express = require('express');
const userRegistry = require('../services/userRegistry');

const router = express.Router();

// GET /api/admin/users
router.get('/users', (req, res) => {
  res.json({ users: userRegistry.listUsers() });
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    const target = await userRegistry.adminResetPassword(
      req.session.userId,
      req.params.id,
      newPassword
    );
    res.json({ ok: true, user: target });
  } catch (err) {
    const status = err.message.includes('Admin') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
