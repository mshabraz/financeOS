import { useState } from 'react';
import { Bell, Smartphone, Info } from 'lucide-react';
import {
  notificationSupported,
  notificationPermission,
  sendTestNotification,
} from '../../utils/browserNotifications';

export default function NotificationPanel() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const perm = notificationPermission();

  const onTest = async () => {
    setError(null);
    setStatus('Sending…');
    try {
      await sendTestNotification();
      setStatus('Test sent — check your notification tray.');
    } catch (e) {
      setError(e.message || 'Could not send test');
      setStatus(null);
    }
  };

  if (!notificationSupported()) {
    return (
      <div className="card p-4 text-xs text-gray-500">
        Notifications are not supported in this browser.
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Smartphone size={16} className="text-brand-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Phone notifications</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            FinanceOS uses your browser&apos;s notification permission — not SMS or a separate app push server.
            On mobile: open FinanceOS in Chrome/Safari, allow notifications, and for best results add the site to your home screen (PWA).
            Reminders appear when the site is open or recently used; background delivery depends on your browser/OS.
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <Info size={12} />
        Status: <span className="font-medium capitalize">{perm}</span>
      </p>
      <button type="button" className="btn-primary text-xs w-full sm:w-auto gap-1.5" onClick={onTest}>
        <Bell size={14} />
        Send test notification
      </button>
      {status && <p className="text-xs text-emerald-600 dark:text-emerald-400">{status}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
