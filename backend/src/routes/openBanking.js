const express = require('express');
const { runWithUserId } = require('../db/requestContext');
const { openUserDatabase } = require('../db/database');
const {
  isEnabled,
  getStatus,
  assertEnabled,
  filterEstonianBanks,
  REDIRECT_URL,
} = require('../services/openBanking/openBankingConfig');
const {
  listAspsps,
  startAuthorization,
  defaultValidUntil,
  reqMetaFromExpress,
} = require('../services/openBanking/enableBankingClient');
const { createPending, consumePending } = require('../services/openBanking/pendingState');
const {
  listConnections,
  saveConnectionsFromSession,
  completeAuthorization,
  syncConnections,
  disconnectConnection,
} = require('../services/openBanking/bankSync');
const logger = require('../services/logger');

const router = express.Router();

function disabledResponse(res) {
  return res.status(503).json(getStatus());
}

function handleError(res, err) {
  const status = err.status || 500;
  logger.error('[OpenBanking]', err);
  return res.status(status).json({
    error: err.message,
    code: err.code,
  });
}

function settingsRedirect(status, message) {
  const params = new URLSearchParams({ ob: status });
  if (message) params.set('msg', message.slice(0, 200));
  return `/settings?${params.toString()}`;
}

// GET /api/open-banking/callback — public (OAuth return from bank)
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description: errorDesc } = req.query;

    if (error) {
      return res.redirect(settingsRedirect('error', errorDesc || error));
    }
    if (!code || !state) {
      return res.redirect(settingsRedirect('error', 'Missing authorization code'));
    }

    const pending = consumePending(state);
    if (!pending?.userId) {
      return res.redirect(settingsRedirect('error', 'Authorization expired — try connecting again'));
    }

    if (!isEnabled()) {
      return res.redirect(settingsRedirect('error', 'Open banking is not configured'));
    }

    const reqMeta = reqMetaFromExpress(req);
    const { sessionData, aspspName, aspspCountry } = await completeAuthorization(
      code,
      pending,
      reqMeta,
    );

    await runWithUserId(pending.userId, async () => {
      const db = openUserDatabase(pending.userId);
      saveConnectionsFromSession(db, sessionData, aspspName, aspspCountry);
    });

    return res.redirect(settingsRedirect('connected'));
  } catch (err) {
    logger.error('[OpenBanking callback]', err);
    return res.redirect(settingsRedirect('error', err.message));
  }
});

// GET /api/open-banking/status
router.get('/status', (req, res) => {
  res.json(getStatus());
});

// GET /api/open-banking/banks
router.get('/banks', async (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(res);
    const data = await listAspsps(reqMetaFromExpress(req));
    const banks = filterEstonianBanks(data);
    res.json({ banks });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/open-banking/connect  { aspspName, aspspCountry }
router.post('/connect', async (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(res);

    const aspspName = req.body?.aspspName?.trim();
    const aspspCountry = (req.body?.aspspCountry || 'EE').trim().toUpperCase();
    if (!aspspName) {
      return res.status(400).json({ error: 'aspspName is required' });
    }

    const userId = req.financeosUserId || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const state = createPending({ userId, aspspName, aspspCountry });
    const auth = await startAuthorization(
      {
        aspspName,
        aspspCountry,
        state,
        redirectUrl: REDIRECT_URL,
        validUntil: defaultValidUntil(90),
      },
      reqMetaFromExpress(req),
    );

    if (!auth?.url) {
      return res.status(502).json({ error: 'Enable Banking did not return a redirect URL' });
    }

    res.json({ redirectUrl: auth.url, state });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/open-banking/connections
router.get('/connections', (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(res);
    assertEnabled();
    const db = require('../db/database').getDb();
    res.json({ connections: listConnections(db) });
  } catch (err) {
    return handleError(res, err);
  }
});

// DELETE /api/open-banking/connections/:id
router.delete('/connections/:id', async (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(res);
    const db = require('../db/database').getDb();
    const result = await disconnectConnection(db, Number(req.params.id), req);
    res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/open-banking/sync  { connectionId? }
router.post('/sync', async (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(res);
    const db = require('../db/database').getDb();
    const connectionId = req.body?.connectionId ? Number(req.body.connectionId) : undefined;
    const result = await syncConnections(db, { connectionId }, req);
    res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
