/**
 * Browser (Web) Notifications — not native push from the server.
 * Works on phone when FinanceOS is opened in the browser or installed as a PWA,
 * and only after the user taps "Allow notifications".
 */

export function notificationSupported() {
  return typeof Notification !== 'undefined';
}

export function notificationPermission() {
  if (!notificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationSupported()) {
    throw new Error('This browser does not support notifications.');
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked. Enable them in browser/site settings for FinanceOS.');
  }
  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    throw new Error('Permission not granted. Tap Allow when prompted.');
  }
  return result;
}

/**
 * Show a test notification (must be triggered by a user click).
 */
export async function sendTestNotification() {
  await requestNotificationPermission();
  const n = new Notification('FinanceOS test', {
    body: 'If you see this on your phone, reminders can work while FinanceOS is allowed to notify you.',
    tag: 'financeos-test',
    requireInteraction: false,
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
  return true;
}

export function showDueReminder({ title, body, tag, href = '/due' }) {
  if (!notificationSupported() || Notification.permission !== 'granted') return null;
  const n = new Notification(title, { body, tag });
  n.onclick = () => {
    window.focus();
    if (href) window.location.href = href;
    n.close();
  };
  return n;
}
