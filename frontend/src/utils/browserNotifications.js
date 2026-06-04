/**
 * Browser (Web) Notifications — local alerts after user grants permission.
 * Requires HTTPS or localhost (secure context). Not server push/SMS.
 */

export function notificationSupported() {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
}

export function isSecureNotificationContext() {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

/** Sync permission (may be stale in some embedded browsers). */
export function notificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  if (!isSecureNotificationContext()) return 'insecure';
  return Notification.permission;
}

/**
 * Async state from Permissions API — often more accurate than Notification.permission alone.
 * @returns {'granted'|'denied'|'prompt'|'unsupported'|'insecure'}
 */
export async function queryNotificationState() {
  if (!notificationSupported()) return 'unsupported';
  if (!isSecureNotificationContext()) return 'insecure';

  const legacy = Notification.permission;

  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'notifications' });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'denied';
      if (status.state === 'prompt') return 'prompt';
    } catch {
      /* Permissions API unavailable — fall back */
    }
  }

  if (legacy === 'granted') return 'granted';
  if (legacy === 'denied') return 'denied';
  return 'prompt';
}

function siteResetInstructions() {
  const host = typeof window !== 'undefined' ? window.location.host : 'this site';
  return (
    `Notifications are blocked for ${host} (per-site), even if the browser allows sites to ask globally. ` +
    'Reset for this site only: click the lock or tune icon left of the address bar → Site settings → Notifications → Allow. ' +
    'Then reload the page and tap the button again.'
  );
}

/**
 * Request permission — must run directly from a click handler.
 * Always calls requestPermission() when state is prompt/default (do not skip based on stale denied).
 */
export async function requestNotificationPermission() {
  if (!notificationSupported()) {
    throw new Error('This browser does not support notifications.');
  }
  if (!isSecureNotificationContext()) {
    const host = window.location.host || window.location.href;
    throw new Error(
      `Notifications require HTTPS or localhost. You are on ${host}. Open FinanceOS via https:// or http://localhost.`,
    );
  }

  const before = await queryNotificationState();
  if (before === 'granted') return 'granted';

  // User gesture: always try the native prompt when not already granted.
  const result = await Notification.requestPermission();

  const after = await queryNotificationState();
  if (result === 'granted' || after === 'granted') return 'granted';

  if (result === 'denied' || after === 'denied') {
    throw new Error(siteResetInstructions());
  }

  throw new Error('Permission not granted. Choose Allow in the browser prompt, then try again.');
}

export async function sendTestNotification() {
  await requestNotificationPermission();

  if (Notification.permission !== 'granted') {
    const state = await queryNotificationState();
    if (state !== 'granted') {
      throw new Error(siteResetInstructions());
    }
  }

  const n = new Notification('FinanceOS test', {
    body: 'If you see this, due-date reminders can use browser notifications for this site.',
    tag: 'financeos-test',
    icon: '/logo-icon.svg',
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
  return true;
}

export function showDueReminder({ title, body, tag, href = '/due' }) {
  if (!notificationSupported() || !isSecureNotificationContext()) return null;
  if (Notification.permission !== 'granted') return null;
  const n = new Notification(title, { body, tag, icon: '/logo-icon.svg' });
  n.onclick = () => {
    window.focus();
    if (href) window.location.href = href;
    n.close();
  };
  return n;
}
