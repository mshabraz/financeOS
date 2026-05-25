import axios from 'axios';
import { sanitizeTransactionParams } from '../utils/dateFilters';

/**
 * API base URL:
 * - Production / LAN unified server: relative '/api' (same origin)
 * - Dev on another device: set VITE_API_URL=http://192.168.x.x:3001/api in .env.local
 */
function resolveBaseURL() {
  const env = import.meta.env.VITE_API_URL;
  if (env) return env.replace(/\/$/, '');
  return '/api';
}

export const apiBaseURL = resolveBaseURL();

/** Large CSV imports can take a while (parse + dedup + categorize). */
const IMPORT_TIMEOUT_MS = 180_000;

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && err.response?.data?.code === 'AUTH_REQUIRED') {
      const event = new CustomEvent('financeos:auth-required');
      window.dispatchEvent(event);
    }
    let message = err.response?.data?.error || err.message || 'Unknown error';
    if (err.code === 'ECONNABORTED') {
      message = 'Import timed out — large files can take a while. Wait and retry, or restart FinanceOS if the server was busy.';
    } else if (!err.response && err.message === 'Network Error') {
      message = 'Cannot reach the server. Check that FinanceOS is running and you are on the same network.';
    }
    const wrapped = new Error(message);
    if (err.response?.data?.code) wrapped.code = err.response.data.code;
    return Promise.reject(wrapped);
  }
);

export const getAuthStatus   = () => api.get('/auth/status');
export const login           = (password) => api.post('/auth/login', { password });
export const setupPassword   = (password) => api.post('/auth/setup', { password });
export const logout          = () => api.post('/auth/logout');
export const getNetworkInfo  = () => api.get('/network/info');

// --- Transactions ---
export const getTransactions = (params) =>
  api.get('/transactions', { params: sanitizeTransactionParams(params) });
export const updateTransaction = (id, data) => api.patch(`/transactions/${id}`, data);
export const exportTransactionsCSV = () =>
  axios.get(`${apiBaseURL}/transactions/export/csv`, {
    responseType: 'blob',
    withCredentials: true,
  });

// --- Import ---
export const previewImport = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/import/preview', form, { timeout: IMPORT_TIMEOUT_MS });
};

export const commitImport = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/import/commit', form, { timeout: IMPORT_TIMEOUT_MS });
};

export const getImportSessions = () => api.get('/import/sessions');

// --- Revolut (import & manage; included in unified transactions & analytics) ---
export const previewRevolutImport = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/revolut/import/preview', form, { timeout: IMPORT_TIMEOUT_MS });
};
export const commitRevolutImport = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/revolut/import/commit', form, { timeout: IMPORT_TIMEOUT_MS });
};
export const getRevolutImportSessions = () => api.get('/revolut/import/sessions');
export const getRevolutTransactions = (params) =>
  api.get('/revolut/transactions', { params: sanitizeTransactionParams(params) });
export const getRevolutTypes = () => api.get('/revolut/types');
export const updateRevolutTransaction = (id, data) => api.patch(`/revolut/transactions/${id}`, data);
export const exportRevolutCSV = () =>
  axios.get(`${apiBaseURL}/revolut/export/csv`, {
    responseType: 'blob',
    withCredentials: true,
  });
export const assignRevolutTag = (rxId, tagId) =>
  api.post(`/tags/revolut-transaction/${rxId}`, { tagId });
export const removeRevolutTag = (rxId, tagId) =>
  api.delete(`/tags/revolut-transaction/${rxId}/${tagId}`);

// --- Categories ---
export const getCategories = () => api.get('/categories');
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.patch(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);

// --- Category Rules ---
export const getCategoryRules = () => api.get('/categories/rules/all');
export const createCategoryRule = (data) => api.post('/categories/rules', data);
export const updateCategoryRule = (id, data) => api.patch(`/categories/rules/${id}`, data);
export const deleteCategoryRule = (id) => api.delete(`/categories/rules/${id}`);
export const applyCategoryRule  = (id, body = {}) => api.post(`/categories/rules/${id}/apply`, body);

// --- Dashboard ---
export const getDashboardSummary = (periodType, periodValue) =>
  api.get('/dashboard/summary', { params: { periodType, periodValue } });
export const getByCategory   = (params) => api.get('/dashboard/by-category',  { params });
export const getMonthlyTrend = (params) => api.get('/dashboard/monthly-trend', { params });
export const getQuarterlyTrend = (year)  => api.get('/dashboard/quarterly-trend', { params: { year } });
export const getYearlyTrend   = (years)  => api.get('/dashboard/yearly-trend',    { params: { years } });
export const getTopMerchants = (paramsOrType, periodValue, limit = 10) => {
  const params = typeof paramsOrType === 'object'
    ? paramsOrType
    : { periodType: paramsOrType, periodValue, limit };
  return api.get('/dashboard/top-merchants', { params: sanitizeTransactionParams(params) });
};
export const getRecurring = (params = {}) =>
  api.get('/dashboard/recurring', { params: sanitizeTransactionParams(params) });
export const getBankBalance   = () => api.get('/dashboard/bank-balance');
export const getAssets        = () => api.get('/dashboard/assets');
export const getManualBalances = ()        => api.get('/dashboard/manual-balances');
export const updateManualBalance = (key, amount) =>
  api.put(`/dashboard/manual-balances/${key}`, { amount });
export const addManualBalance = (data) => api.post('/dashboard/manual-balances', data);
export const deleteManualBalance = (key) => api.delete(`/dashboard/manual-balances/${key}`);
export const getBudgets       = (month)  => api.get('/dashboard/budgets', { params: { month } });
export const upsertBudget     = (data)   => api.put('/dashboard/budgets', data);
export const getAvailableYears = ()      => api.get('/dashboard/available-years');

// --- Tags ---
export const getTags = () => api.get('/tags');
export const createTag = (data) => api.post('/tags', data);
export const updateTag = (id, data) => api.patch(`/tags/${id}`, data);
export const deleteTag = (id) => api.delete(`/tags/${id}`);
export const mergeTag = (sourceId, targetId) =>
  api.post(`/tags/${sourceId}/merge/${targetId}`);

export const getTagSummary = () => api.get('/tags/summary/all');
export const getTagAnalytics = (id) => api.get(`/tags/${id}/analytics`);
export const getTransactionTags = (txId) => api.get(`/tags/transaction/${txId}`);
export const assignTag = (txId, tagId) =>
  api.post(`/tags/transaction/${txId}`, { tagId });
export const removeTag = (txId, tagId) =>
  api.delete(`/tags/transaction/${txId}/${tagId}`);
export const bulkAssignTag = (tagId, transactionIds = [], revolutTransactionIds = []) =>
  api.post('/tags/bulk-assign', {
    tagId,
    transactionIds,
    revolutTransactionIds,
  });
export const bulkRemoveTag = (tagId, transactionIds = [], revolutTransactionIds = []) =>
  api.post('/tags/bulk-remove', {
    tagId,
    transactionIds,
    revolutTransactionIds,
  });

// --- Investments ---
export const previewInvestmentImport = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/investments/preview', form, { timeout: IMPORT_TIMEOUT_MS });
};
export const commitInvestmentImport = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/investments/commit', form, { timeout: IMPORT_TIMEOUT_MS });
};
export const getInvestmentTransactions = (params) => api.get('/investments/transactions', { params });
export const updateInvestmentTransaction = (id, data) =>
  api.patch(`/investments/transactions/${id}`, data);
export const exportInvestmentTransactionsCSV = () =>
  axios.get(`${apiBaseURL}/investments/transactions/export/csv`, {
    responseType: 'blob',
    withCredentials: true,
  });
export const getInvestmentHoldings = (broker) =>
  api.get('/investments/holdings', { params: broker ? { broker } : {} });
export const getInvestmentValuations = (broker) =>
  api.get('/investments/valuations', { params: broker ? { broker } : {} });
export const getInvestmentAnalytics = (params = {}) =>
  api.get('/investments/analytics', { params });
export const getInvestmentBrokerCash = (broker) =>
  api.get('/investments/broker-cash', { params: broker ? { broker } : {} });
export const setInvestmentBrokerCash = (body) =>
  api.put('/investments/broker-cash', body);
export const setInvestmentHoldingQuantity = (body) =>
  api.put('/investments/holdings/quantity', body);
export const setInvestmentHoldingAvgCost = (body) =>
  api.put('/investments/holdings/avg-cost', body);
export const getInvestmentPriceSyncStatus = () => api.get('/investments/prices/sync-status');
export const triggerInvestmentPriceSync = () => api.post('/investments/prices/sync');
export const getInvestmentMarketHealth = () => api.get('/investments/market-data/health');
export const searchInvestmentSecurities = (q) =>
  api.get('/investments/securities/search', { params: { q } });
export const bindInvestmentSecurity = (body) => api.put('/investments/bindings', body);
export const clearInvestmentBinding = (params) =>
  api.delete('/investments/bindings', { params });
export const clearAutoInvestmentBindings = () =>
  api.post('/investments/bindings/clear-auto');
export const getInvestmentDividends = (broker) =>
  api.get('/investments/dividends', { params: broker ? { broker } : {} });
export const getInvestmentSummary = (params) => api.get('/investments/summary', { params });
export const getInvestmentActivity = (months) => api.get('/investments/activity', { params: { months } });
export const getInvestmentTickers = () => api.get('/investments/tickers');
export const getBrokerSummary = () => api.get('/investments/broker-summary');
export const getImportHistory = () => api.get('/investments/history');
export const detectBroker = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/investments/detect', form);
};

// --- Watched-folder auto-import ---
export const getWatchedImportConfig = () => api.get('/watched-import/config');
export const updateWatchedImportConfig = (body) => api.put('/watched-import/config', body);
export const validateWatchedFolderPath = (folderPath) =>
  api.post('/watched-import/validate-path', { folderPath });
export const getWatchedImportHistory = (limit = 50) =>
  api.get('/watched-import/history', { params: { limit } });
export const getWatchedImportNotifications = (limit = 20) =>
  api.get('/watched-import/notifications', { params: { limit } });
export const getWatchedImportStatus = () => api.get('/watched-import/status');
export const scanWatchedFolderNow = () => api.post('/watched-import/scan-now');

// --- Bulk categorization ---
export const bulkCategorizePrev = (body) => api.post('/transactions/bulk-categorize/preview', body);
export const bulkCategorizeApply = (body) => api.post('/transactions/bulk-categorize/apply', body);
export const bulkUpdateCategory = (ids, categoryId) =>
  api.patch('/transactions/bulk', { ids, categoryId });

// --- Shared expenses (standalone) ---
export const getSharedEvents = async () => {
  const data = await api.get('/shared/events');
  return Array.isArray(data) ? data : [];
};
export const createSharedEvent = (body) => api.post('/shared/events', body);
export const getSharedEvent = (id) => api.get(`/shared/events/${id}`);
export const updateSharedEvent = (id, body) => api.patch(`/shared/events/${id}`, body);
export const deleteSharedEvent = (id) => api.delete(`/shared/events/${id}`);
export const addSharedParticipant = (eventId, name) =>
  api.post(`/shared/events/${eventId}/participants`, { name });
export const updateSharedParticipant = (id, name) =>
  api.patch(`/shared/participants/${id}`, { name });
export const deleteSharedParticipant = (id) => api.delete(`/shared/participants/${id}`);
export const importSharedParticipants = (eventId, sourceEventId) =>
  api.post(`/shared/events/${eventId}/participants/import`, { sourceEventId });
export const setSharedTransferSettled = (eventId, body) =>
  api.patch(`/shared/events/${eventId}/settlement/settled`, body);
export const createSharedExpense = (eventId, body) =>
  api.post(`/shared/events/${eventId}/expenses`, body);
export const updateSharedExpense = (id, body) => api.patch(`/shared/expenses/${id}`, body);
export const deleteSharedExpense = (id) => api.delete(`/shared/expenses/${id}`);

export default api;
