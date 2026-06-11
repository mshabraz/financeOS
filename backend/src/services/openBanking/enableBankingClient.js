/**
 * Enable Banking API client — JWT auth and HTTP calls.
 * @see https://enablebanking.com/docs/api/reference/
 */

const fs = require('fs');
const crypto = require('crypto');
const { fetch } = require('undici');
const {
  APP_ID,
  PRIVATE_KEY_PATH,
  API_BASE,
  assertEnabled,
} = require('./openBankingConfig');
const logger = require('../logger');

let cachedPrivateKey = null;

function loadPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;
  cachedPrivateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  return cachedPrivateKey;
}

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** RS256 JWT for Enable Banking API (TTL max 24h; we use 1h). */
function createJwt(ttlSec = 3600) {
  const header = { typ: 'JWT', alg: 'RS256', kid: APP_ID };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + ttlSec,
  };
  const signingInput = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(loadPrivateKey()).toString('base64url');
  return `${signingInput}.${signature}`;
}

function buildPsuHeaders(reqMeta = {}) {
  const headers = {
    Authorization: `Bearer ${createJwt()}`,
    Accept: 'application/json',
  };
  if (reqMeta.ip) headers['psu-ip-address'] = reqMeta.ip;
  if (reqMeta.userAgent) headers['psu-user-agent'] = reqMeta.userAgent;
  return headers;
}

async function parseResponse(res, context) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.error || body?.detail || text || res.statusText;
    const err = new Error(`Enable Banking ${context}: ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function apiRequest(method, path, { body, reqMeta } = {}) {
  assertEnabled();
  const headers = buildPsuHeaders(reqMeta);
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, init);
  return parseResponse(res, `${method} ${path}`);
}

async function listAspsps(reqMeta) {
  return apiRequest('GET', '/aspsps', { reqMeta });
}

async function startAuthorization({ aspspName, aspspCountry, state, redirectUrl, validUntil }, reqMeta) {
  return apiRequest('POST', '/auth', {
    reqMeta,
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country: aspspCountry },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
    },
  });
}

async function authorizeSession(code, reqMeta) {
  return apiRequest('POST', '/sessions', { reqMeta, body: { code } });
}

async function getSession(sessionId, reqMeta) {
  return apiRequest('GET', `/sessions/${sessionId}`, { reqMeta });
}

async function deleteSession(sessionId, reqMeta) {
  return apiRequest('DELETE', `/sessions/${sessionId}`, { reqMeta });
}

async function getAccountTransactions(accountId, { dateFrom, dateTo, continuationKey }, reqMeta) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (continuationKey) params.set('continuation_key', continuationKey);
  const qs = params.toString();
  const path = `/accounts/${accountId}/transactions${qs ? `?${qs}` : ''}`;
  return apiRequest('GET', path, { reqMeta });
}

/** Fetch all transaction pages for an account. */
async function fetchAllTransactions(accountId, { dateFrom, dateTo }, reqMeta) {
  const all = [];
  let continuationKey = null;
  do {
    const page = await getAccountTransactions(
      accountId,
      { dateFrom, dateTo, continuationKey },
      reqMeta,
    );
    const txs = page?.transactions || [];
    all.push(...txs);
    continuationKey = page?.continuation_key || null;
  } while (continuationKey);
  return all;
}

function defaultValidUntil(days = 90) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || undefined;
}

function reqMetaFromExpress(req) {
  return {
    ip: extractClientIp(req),
    userAgent: req.headers['user-agent'],
  };
}

module.exports = {
  createJwt,
  listAspsps,
  startAuthorization,
  authorizeSession,
  getSession,
  deleteSession,
  getAccountTransactions,
  fetchAllTransactions,
  defaultValidUntil,
  reqMetaFromExpress,
};
