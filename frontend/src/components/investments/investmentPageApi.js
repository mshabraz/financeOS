import api from '../../api/client';

export const getImportHistory = () => api.get('/investments/history');

export function detectBroker(file) {
  const f = new FormData();
  f.append('file', file);
  return api.post('/investments/detect', f);
}
