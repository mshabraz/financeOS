const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithUserId(userId, fn) {
  return storage.run({ userId }, fn);
}

function getRequestUserId() {
  return storage.getStore()?.userId ?? null;
}

module.exports = { runWithUserId, getRequestUserId };
