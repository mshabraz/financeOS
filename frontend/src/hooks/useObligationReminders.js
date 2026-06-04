import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getObligationReminders, ackObligationReminder } from '../api/client';
import { fmtCurrency } from '../utils/displayFormat';

/**
 * Poll due reminders and surface browser notifications when permitted.
 */
export function useObligationReminders(enabled = true) {
  const notifiedRef = useRef(new Set());

  const reminders = useQuery({
    queryKey: ['obligationReminders'],
    queryFn: () => getObligationReminders(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!enabled || !reminders.data?.reminders?.length) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    if (Notification.permission !== 'granted') return;

    for (const r of reminders.data.reminders) {
      if (notifiedRef.current.has(r.reminderKey)) continue;
      notifiedRef.current.add(r.reminderKey);
      const label = r.direction === 'receivable' ? 'Collect' : 'Pay';
      const body = `${label} ${fmtCurrency(r.amount, r.currency)}${r.counterparty ? ` · ${r.counterparty}` : ''} · due ${r.dueDate}`;
      const n = new Notification(`Due & Owed: ${r.title}`, { body, tag: r.reminderKey });
      n.onclick = () => {
        window.focus();
        window.location.href = '/due';
      };
      ackObligationReminder(r.obligationId, r.reminderKey).catch(() => {});
    }
  }, [enabled, reminders.data]);

  return reminders;
}
