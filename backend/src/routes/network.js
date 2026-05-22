const express = require('express');
const config = require('../config');
const {
  getLanUrls,
  getPrimaryLanIp,
  getPreferredLanAddresses,
  hostname,
} = require('../services/networkInfo');

const router = express.Router();

// GET /api/network/info — public; helps phones/tablets find the server
router.get('/info', (req, res) => {
  const port = config.SERVE_FRONTEND ? config.PORT : config.FRONTEND_PORT;
  const apiPort = config.PORT;
  const scheme = config.HTTPS_ENABLED ? 'https' : 'http';
  const primaryIp = getPrimaryLanIp();

  res.json({
    app: 'FinanceOS',
    hostname: hostname(),
    lanMode: config.LAN_MODE,
    authEnabled: config.AUTH_ENABLED,
    primaryLanIp: primaryIp,
    phoneUrl: primaryIp ? `${scheme}://${primaryIp}:${config.SERVE_FRONTEND ? apiPort : port}/` : null,
    addresses: getPreferredLanAddresses(),
    urls: getLanUrls({ port: config.SERVE_FRONTEND ? apiPort : port, https: config.HTTPS_ENABLED }),
  });
});

module.exports = router;
