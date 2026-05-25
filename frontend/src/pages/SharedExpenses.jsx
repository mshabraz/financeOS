import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Receipt, ChevronRight, Trash2 } from 'lucide-react';
import { getSharedEvents, createSharedEvent, deleteSharedEvent } from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const fmt = (n, currency = 'EUR') =>
  new Intl.NumberFormat('et-EE', { style: 'currency', currency }).format(n ?? 0);

export default function SharedExpenses() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const events = useQuery({ queryKey: ['sharedEvents'], queryFn: getSharedEvents });

  const createMut = useMutation({
    mutationFn: () => createSharedEvent({ name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sharedEvents'] });
      setName('');
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSharedEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharedEvents'] }),
  });

  if (events.isLoading) return <LoadingSpinner />;

  if (events.isError) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shared Expenses</h1>
        <div className="card p-6 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          <p className="font-medium">Could not load shared events.</p>
          <p className="mt-1 opacity-90">{events.error?.message || 'Unknown error'}</p>
          <p className="mt-2 text-xs opacity-80">
            If this mentions a missing table, run database migration on the server (<code>npm run db:migrate</code>).
          </p>
          <button type="button" className="btn-secondary text-xs mt-3" onClick={() => events.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const eventList = Array.isArray(events.data) ? events.data : [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shared Expenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Split trips, dinners, and group costs — separate from your personal finance tracking.
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} />
          New event
        </button>
      </div>

      {showForm && (
        <div className="card p-4 flex flex-col sm:flex-row gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. Weekend Getaway 23 May 2025"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && createMut.mutate()}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Create
          </button>
        </div>
      )}

      {eventList.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>No events yet. Create one for a trip or group expense.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {eventList.map((ev) => (
            <li key={ev.id}>
              <div className="card p-4 flex items-center gap-3">
                <Link to={`/shared/${ev.id}`} className="flex-1 min-w-0 flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0">
                    <Receipt size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 truncate">
                      {ev.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {ev.participant_count} people · {ev.expense_count} expenses · {fmt(ev.total_spend, ev.currency)}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 shrink-0" />
                </Link>
                <button
                  type="button"
                  className="p-2 text-gray-400 hover:text-red-500"
                  title="Delete event"
                  onClick={() => {
                    if (window.confirm(`Delete "${ev.name}" and all its data?`)) deleteMut.mutate(ev.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
