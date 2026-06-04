import { useState, useEffect, useCallback } from 'react';
import { Bell, Smartphone, Info, RefreshCw } from 'lucide-react';
import {
  notificationSupported,
  isSecureNotificationContext,
  queryNotificationState,
  requestNotificationPermission,
  sendTestNotification,
} from '../../utils/browserNotifications';

const STATE_LABELS = {
  granted: 'Allowed',
  denied: 'Blocked for this site',
  prompt: 'Not asked yet — tap Enable below',
  unsupported: 'Not supported',
  insecure: 'Needs HTTPS or localhost',
};

export default function NotificationPanel() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [perm, setPerm] = useState('…');
  const host = typeof window !== 'undefined' ? window.location.host : '';

  const refresh = useCallback(async () => {
    if (!notificationSupported()) {
      setPerm('unsupported');
      return;
    }
    if (!isSecureNotificationContext()) {
      setPerm('insecure');
      return;
    }
    setPerm(await queryNotificationState());
  }, []);

  useEffect(() => {
    refresh();
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'notifications' }).then((s) => {
        const onChange = () => refresh();
        s.addEventListener('change', onChange);
        return () => s.removeEventListener('change', onChange);
      }).catch(() => {});
    }
  }, [refresh]);

  const onEnable = async () => {
    setError(null);
    setStatus('Waiting for browser prompt…');
    try {
      await requestNotificationPermission();
      await refresh();
      setStatus('Allowed — you can send a test notification now.');
    } catch (e) {
      setError(e.message || 'Could not enable');
      setStatus(null);
      await refresh();
    }
  };

  const onTest = async () => {
    setError(null);
    setStatus('Sending…');
    try {
      await sendTestNotification();
      setStatus('Test sent — check your notification tray (Action Center on Windows).');
      await refresh();
    } catch (e) {
      setError(e.message || 'Could not send test');
      setStatus(null);
      await refresh();
    }
  };

  if (!notificationSupported()) {
    return (
      <div className="card p-4 text-xs text-gray-500">
        Notifications are not supported in this browser. Open FinanceOS in Chrome, Edge, or Safari.
      </div>
    );
  }

  if (!isSecureNotificationContext()) {
    return (
      <div className="card p-4 text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20">
        <p className="font-medium">HTTPS required for notifications</p>
        <p className="mt-1 opacity-90">
          This page is not a secure context ({host || 'unknown host'}). Use https:// or open via localhost.
        </p>
      </div>
    );
  }

  const canTest = perm === 'granted';

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Smartphone size={16} className="text-brand-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Browser notifications</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Global browser setting &quot;Sites can ask&quot; is not enough — each site must be allowed separately.
            FinanceOS only notifies this origin: <span className="font-mono text-gray-600 dark:text-gray-400">{host}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Info size={12} className="shrink-0" />
        <span>
          Status for this site:{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {STATE_LABELS[perm] || perm}
          </span>
        </span>
        <button type="button" className="text-brand-600 hover:underline inline-flex items-center gap-1" onClick={refresh}>
          <RefreshCw size={10} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {perm !== 'granted' && (
          <button type="button" className="btn-primary text-xs gap-1.5 flex-1" onClick={onEnable}>
            <Bell size={14} />
            Enable notifications
          </button>
        )}
        <button
          type="button"
          className="btn-secondary text-xs gap-1.5 flex-1"
          onClick={onTest}
          disabled={!canTest && perm === 'denied'}
          title={!canTest ? 'Enable notifications first' : undefined}
        >
          Send test notification
        </button>
      </div>

      {perm === 'denied' && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3 text-[11px] text-gray-600 dark:text-gray-400 space-y-1.5 leading-relaxed">
          <p className="font-medium text-gray-800 dark:text-gray-200">Unblock for {host}</p>
          <p>Chrome / Edge: address bar → lock or tune icon → Site settings → Notifications → <strong>Allow</strong> → reload.</p>
          <p>Firefox: address bar → lock → Permissions → Notifications → Allow → reload.</p>
          <p>Safari (iPhone): Settings → Safari → Website Settings → find this site → Notifications → Allow.</p>
        </div>
      )}

      {status && <p className="text-xs text-emerald-600 dark:text-emerald-400">{status}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>}
    </div>
  );
}
