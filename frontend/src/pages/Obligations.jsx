import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Bell, Wallet, ArrowDownLeft, ArrowUpRight, AlertCircle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import clsx from 'clsx';
import {
  getObligations, getObligationsSummary, createObligation, updateObligation,
  markObligationPaid, settleObligation, snoozeObligation, cancelObligation,
  getObligationsCalendar,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { fmtCurrency, privText } from '../utils/displayFormat';
import { usePrivacy } from '../context/PrivacyContext';
import { useObligationReminders } from '../hooks/useObligationReminders';
import { TABS } from '../components/obligations/obligationConstants';
import ObligationCard from '../components/obligations/ObligationCard';
import ObligationFormModal from '../components/obligations/ObligationFormModal';
import ObligationSettleModal from '../components/obligations/ObligationSettleModal';
import NotificationPanel from '../components/obligations/NotificationPanel';
import { Link } from 'react-router-dom';

const fmt = (n) => fmtCurrency(n, 'EUR');

export default function Obligations() {
  usePrivacy();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'upcoming');

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [searchParams]);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [settleRow, setSettleRow] = useState(null);
  const [search, setSearch] = useState('');

  const filter = tab === 'payable' ? 'payable' : tab === 'receivable' ? 'receivable' : tab;

  const summary = useQuery({ queryKey: ['obligationsSummary'], queryFn: getObligationsSummary });
  const list = useQuery({
    queryKey: ['obligations', filter, search],
    queryFn: () => getObligations({ filter: tab === 'calendar' ? 'active' : filter, q: search || undefined }),
    enabled: tab !== 'calendar',
  });
  const calendar = useQuery({
    queryKey: ['obligationsCalendar'],
    queryFn: () => getObligationsCalendar({
      from: format(new Date(), 'yyyy-MM-dd'),
      to: format(addDays(new Date(), 60), 'yyyy-MM-dd'),
    }),
    enabled: tab === 'calendar',
  });

  const reminders = useObligationReminders(true);

  const invalidate = () => {
    ['obligations', 'obligationsSummary', 'obligationReminders', 'obligationsCalendar'].forEach((k) => {
      qc.invalidateQueries({ queryKey: [k] });
    });
  };

  const createMut = useMutation({
    mutationFn: (body) => (editRow ? updateObligation(editRow.id, body) : createObligation(body)),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setEditRow(null);
    },
  });

  const paidMut = useMutation({
    mutationFn: markObligationPaid,
    onSuccess: invalidate,
  });

  const settleMut = useMutation({
    mutationFn: ({ id, body }) => settleObligation(id, body),
    onSuccess: () => {
      invalidate();
      setSettleRow(null);
    },
  });

  const snoozeMut = useMutation({
    mutationFn: (row) => snoozeObligation(row.id, format(addDays(new Date(), 3), 'yyyy-MM-dd')),
    onSuccess: invalidate,
  });

  const cancelMut = useMutation({
    mutationFn: cancelObligation,
    onSuccess: invalidate,
  });

  const s = summary.data;
  const rows = list.data ?? [];
  const reminderCount = reminders.data?.reminders?.length ?? 0;
  const activeTab = TABS.find((t) => t.id === tab);
  const monthLabel = s?.monthLabel
    ? new Date(`${s.monthLabel}-01`).toLocaleString(undefined, { month: 'long', year: 'numeric' })
    : null;

  const calendarDays = useMemo(() => {
    if (!calendar.data?.byDate) return [];
    return Object.entries(calendar.data.byDate)
      .filter(([d]) => d !== 'no_date')
      .sort(([a], [b]) => a.localeCompare(b));
  }, [calendar.data]);

  if (summary.isLoading && list.isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Due & Owed</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bills to pay, money owed to you, and IOUs — separate from spending analytics.
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={() => { setEditRow(null); setShowForm(true); }}>
          <Plus size={16} />
          Add
        </button>
      </header>

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3">
            <p className="text-[10px] uppercase text-gray-400 flex items-center gap-1"><Bell size={10} /> Reminders</p>
            <p className="text-lg font-bold tabular-nums mt-1">{reminderCount}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] uppercase text-gray-400 flex items-center gap-1"><ArrowUpRight size={10} className="text-emerald-500" /> Owed to me</p>
            <p className="text-lg font-bold tabular-nums mt-1 text-emerald-600">{fmt(s.totals?.owedToMeEur)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] uppercase text-gray-400 flex items-center gap-1"><ArrowDownLeft size={10} className="text-amber-600" /> I owe</p>
            <p className="text-lg font-bold tabular-nums mt-1 text-amber-700">{fmt(s.totals?.iOweEur)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] uppercase text-gray-400 flex items-center gap-1"><AlertCircle size={10} className="text-red-500" /> Overdue</p>
            <p className="text-lg font-bold tabular-nums mt-1">{s.counts?.overdue ?? 0}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === t.id
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
            )}
          >
            {t.label}
          </button>
        ))}
        <Link
          to="/tasks"
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-brand-600"
        >
          Tasks →
        </Link>
      </div>

      {activeTab?.hint && tab !== 'calendar' && tab !== 'recurring' && tab !== 'settled' && (
        <p className="text-xs text-gray-500 px-1">
          {activeTab.hint}
          {monthLabel && (tab === 'upcoming' || tab === 'payable' || tab === 'receivable') ? ` · ${monthLabel}` : ''}
        </p>
      )}

      <NotificationPanel />

      {tab !== 'calendar' && (
        <input
          className="input w-full"
          placeholder="Search title, person, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {list.isLoading && tab !== 'calendar' ? (
        <LoadingSpinner />
      ) : tab === 'calendar' ? (
        <div className="space-y-3">
          {calendar.isLoading && <LoadingSpinner />}
          {calendarDays.map(([date, items]) => (
            <div key={date} className="card p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2 tabular-nums">{date}</p>
              <ul className="space-y-2">
                {items.map((r) => (
                  <li key={r.id} className="flex justify-between text-sm gap-2">
                    <span className="truncate">{privText(r.title)}</span>
                    <span className="tabular-nums font-medium shrink-0">{fmt(r.amount_remaining)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!calendarDays.length && !calendar.isLoading && (
            <p className="text-center text-sm text-gray-400 py-8">No upcoming due dates in the next 60 days</p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <ObligationCard
                row={r}
                onMarkPaid={() => paidMut.mutate(r.id)}
                onSettle={() => setSettleRow(r)}
                onSnooze={() => snoozeMut.mutate(r)}
                onEdit={() => { setEditRow(r); setShowForm(true); }}
                onCancel={() => cancelMut.mutate(r.id)}
              />
            </li>
          ))}
          {!rows.length && (
            <div className="card p-8 text-center text-sm text-gray-400">
              <Wallet size={32} className="mx-auto mb-2 opacity-40" />
              {tab === 'upcoming' && monthLabel
                ? `Nothing due in ${monthLabel}. Add rent or bills with a due date this month.`
                : tab === 'payable'
                  ? `Nothing to pay this month. Future months stay hidden until their month.`
                  : 'Nothing here. Add a bill, subscription, or IOU.'}
            </div>
          )}
        </ul>
      )}

      <ObligationFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditRow(null); }}
        initial={editRow}
        saving={createMut.isPending}
        onSubmit={(body) => createMut.mutate(body)}
      />

      <ObligationSettleModal
        row={settleRow}
        onClose={() => setSettleRow(null)}
        saving={settleMut.isPending}
        onSubmit={(body) => settleMut.mutate({ id: settleRow.id, body })}
      />
    </div>
  );
}
