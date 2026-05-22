import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, RefreshCw, Play, CheckCircle2, AlertTriangle, XCircle,
  Bell, FileText, Info,
} from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  getWatchedImportConfig,
  updateWatchedImportConfig,
  validateWatchedFolderPath,
  getWatchedImportHistory,
  getWatchedImportNotifications,
  scanWatchedFolderNow,
} from '../api/client';

const KIND_LABELS = {
  bank: 'Bank (LHV)',
  revolut: 'Revolut',
  investment: 'Investment',
  unsupported: 'Unsupported',
  skipped: 'Skipped',
};

const STATUS_STYLES = {
  success: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  partial_success: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  duplicate_only: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  no_new: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  unsupported: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
  skipped: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
};

const STATUS_LABELS = {
  success: 'Imported',
  partial_success: 'Imported (warnings)',
  duplicate_only: 'No new',
  no_new: 'No new',
  failed: 'Failed',
  unsupported: 'Unsupported',
  skipped: 'Skipped',
};

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status?.replace(/_/g, ' ') || '—';
  return (
    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', STATUS_STYLES[status] || STATUS_STYLES.skipped)}>
      {label}
    </span>
  );
}

function NotificationIcon({ type, severity }) {
  if (type === 'success') return <CheckCircle2 size={16} className="text-green-500 shrink-0" />;
  if (type === 'duplicate_only' || type === 'skipped') {
    return <AlertTriangle size={16} className={severity === 'info' ? 'text-gray-400 shrink-0' : 'text-amber-500 shrink-0'} />;
  }
  if (type === 'unsupported') return <AlertTriangle size={16} className="text-orange-500 shrink-0" />;
  return <XCircle size={16} className="text-red-500 shrink-0" />;
}

function NotificationItem({ n }) {
  const detail = n.detail || n.errorMessage;
  return (
    <li className="px-5 py-3 flex gap-2.5 text-sm">
      <NotificationIcon type={n.type} severity={n.severity} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 dark:text-gray-200">
          {n.fileName || 'Scan'}
          <span className="font-normal text-gray-500 dark:text-gray-400"> — {n.message}</span>
        </p>
        {detail && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{detail}</p>
        )}
        {(n.newCount > 0 || n.duplicateCount > 0) && (
          <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
            {n.newCount > 0 && `+${n.newCount} new`}
            {n.newCount > 0 && n.duplicateCount > 0 && ' · '}
            {n.duplicateCount > 0 && `${n.duplicateCount} duplicates`}
          </p>
        )}
        <div className="text-xs text-gray-400 mt-1">{fmtTime(n.at)}</div>
      </div>
    </li>
  );
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function Settings() {
  const qc = useQueryClient();
  const [folderPath, setFolderPath] = useState('');
  const [pathHint, setPathHint] = useState(null);
  const [toast, setToast] = useState(null);

  const configQ = useQuery({
    queryKey: ['watchedImportConfig'],
    queryFn: getWatchedImportConfig,
    refetchInterval: 30_000,
  });

  const historyQ = useQuery({
    queryKey: ['watchedImportHistory'],
    queryFn: () => getWatchedImportHistory(80),
    refetchInterval: 15_000,
  });

  const notificationsQ = useQuery({
    queryKey: ['watchedImportNotifications'],
    queryFn: () => getWatchedImportNotifications(15),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (configQ.data?.folderPath != null) setFolderPath(configQ.data.folderPath);
  }, [configQ.data?.folderPath]);

  const showToast = (msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5000);
  };

  const saveConfig = useMutation({
    mutationFn: (patch) => updateWatchedImportConfig(patch),
    onSuccess: (data) => {
      qc.setQueryData(['watchedImportConfig'], data);
      showToast('Settings saved', 'success');
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const validatePath = useMutation({
    mutationFn: () => validateWatchedFolderPath(folderPath),
    onSuccess: (r) => {
      if (r.valid) {
        setPathHint({ ok: true, text: `Valid folder · ${r.csvCount ?? 0} CSV file(s) found` });
      } else {
        setPathHint({ ok: false, text: r.error || 'Invalid path' });
      }
    },
    onError: (e) => setPathHint({ ok: false, text: e.message }),
  });

  const scanNow = useMutation({
    mutationFn: scanWatchedFolderNow,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['watchedImportHistory'] });
      qc.invalidateQueries({ queryKey: ['watchedImportNotifications'] });
      qc.invalidateQueries({ queryKey: ['watchedImportConfig'] });
      const s = r.summary;
      if (s?.skipped) {
        showToast('Scan skipped (already running or disabled)', 'info');
      } else if (s?.error) {
        showToast(s.error, 'error');
      } else {
        showToast(
          `Scan done: ${s?.processed ?? 0} processed, ${s?.success ?? 0} imported, ${s?.duplicateOnly ?? 0} dupes only`,
          'success'
        );
      }
    },
    onError: (e) => showToast(e.message, 'error'),
  });

  const cfg = configQ.data;
  const status = cfg?.status;

  if (configQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  const enabled = cfg?.enabled ?? false;
  const intervalSec = cfg?.intervalSec ?? 60;
  const useFsWatch = cfg?.useFsWatch ?? true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Auto-import from a local folder. Manual CSV upload on Transactions and Investments is unchanged."
      />

      {toast && (
        <div
          className={clsx(
            'card px-4 py-3 text-sm',
            toast.kind === 'error' && 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-300',
            toast.kind === 'success' && 'border-green-300 dark:border-green-800 text-green-700 dark:text-green-300'
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Config */}
      <section className="card p-5 space-y-5">
        <div className="flex items-start gap-3">
          <FolderOpen className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" size={22} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Watched folder</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Drop supported CSV exports into this folder. The server scans periodically and imports only new transactions.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => saveConfig.mutate({ enabled: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-brand-600"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Enable automatic import</span>
        </label>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Folder path</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => { setFolderPath(e.target.value); setPathHint(null); }}
              placeholder="C:\Users\you\FinanceOS\imports"
              className="input flex-1 font-mono text-sm"
            />
            <button
              type="button"
              className="btn-secondary shrink-0"
              disabled={validatePath.isPending}
              onClick={() => validatePath.mutate()}
            >
              Validate
            </button>
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={saveConfig.isPending}
              onClick={() => saveConfig.mutate({ folderPath })}
            >
              Save path
            </button>
          </div>
          {pathHint && (
            <p className={clsx('text-xs mt-1.5', pathHint.ok ? 'text-green-600' : 'text-red-600')}>{pathHint.text}</p>
          )}
          {cfg?.folderPath && !cfg?.folderReadable && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
              <AlertTriangle size={14} />
              Saved path is missing or not readable — auto-import is paused until the folder exists.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Scan interval ({intervalSec}s)
            </label>
            <input
              type="range"
              min={15}
              max={600}
              step={15}
              value={intervalSec}
              onChange={(e) => saveConfig.mutate({ intervalSec: parseInt(e.target.value, 10) })}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">15s – 10min between folder scans</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px] sm:mt-6">
            <input
              type="checkbox"
              checked={useFsWatch}
              onChange={(e) => saveConfig.mutate({ useFsWatch: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Use filesystem events (faster when supported)
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={!enabled || scanNow.isPending}
            onClick={() => scanNow.mutate()}
          >
            {scanNow.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            Scan now
          </button>
          {status?.lastScanAt && (
            <span className="text-xs text-gray-500 self-center">
              Last scan: {fmtTime(status.lastScanAt)}
              {status.scanInProgress ? ' · scanning…' : ''}
            </span>
          )}
        </div>
      </section>

      {/* Supported formats */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info size={18} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Supported file types</h2>
        </div>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
          <li>Bank transaction CSV (LHV)</li>
          <li>Revolut account CSV</li>
          <li>Investment exports (Lightyear, Swedbank funds)</li>
          <li>Future parsers are detected automatically when added to the backend</li>
        </ul>
        <p className="text-xs text-gray-400 mt-3">
          Files are fingerprinted by content hash — renamed duplicates are skipped. Partial writes wait until the file size is stable.
        </p>
      </section>

      {/* Notifications */}
      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Bell size={18} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent notifications</h2>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
          {(notificationsQ.data ?? []).length === 0 && (
            <li className="px-5 py-6 text-sm text-gray-400 text-center">No notifications yet</li>
          )}
          {(notificationsQ.data ?? []).map((n, i) => (
            <NotificationItem key={`${n.at}-${i}`} n={n} />
          ))}
        </ul>
      </section>

      {/* Import activity */}
      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <FileText size={18} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
                {['Time', 'File', 'Type', 'Status', 'New', 'Dupes', 'Details'].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyQ.isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400"><LoadingSpinner /></td></tr>
              )}
              {!historyQ.isLoading && (historyQ.data ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No imports yet</td></tr>
              )}
              {(historyQ.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-gray-50 dark:border-gray-800/80 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{fmtTime(row.processed_at)}</td>
                  <td className="px-4 py-2 max-w-[120px] truncate font-medium" title={row.file_name}>{row.file_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{KIND_LABELS[row.import_kind] || row.import_kind}</td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2 tabular-nums text-center">{row.new_count}</td>
                  <td className="px-4 py-2 tabular-nums text-center">{row.duplicate_count}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[220px]">
                    <span className="line-clamp-2" title={row.detail || row.error_message || ''}>
                      {row.detail || row.error_message || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-400 text-center pb-4">
        Manual import: Transactions → Import / Export, or Investments → Import CSV. This page only configures background folder watching.
      </p>
    </div>
  );
}
