import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, Circle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import {
  getTasksGrouped, createTask, updateTask, completeTask, deleteTask,
} from '../api/client';
import LoadingSpinner from '../components/ui/LoadingSpinner';

function TaskRow({ task, onToggle, onDelete, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(task.notes || '');

  return (
    <li className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 shrink-0 text-gray-400 hover:text-brand-600"
          onClick={() => onToggle(task)}
          aria-label={task.completed ? 'Mark incomplete' : 'Complete'}
        >
          {task.completed ? <Check size={20} className="text-emerald-500" /> : <Circle size={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-medium', task.completed && 'line-through text-gray-400')}>
            {task.title}
          </p>
          {task.due_date && (
            <p className="text-[11px] text-gray-500 tabular-nums mt-0.5">
              {task.due_date}{task.due_time ? ` · ${task.due_time}` : ''}
            </p>
          )}
          {(task.notes || expanded) && (
            <button
              type="button"
              className="text-[10px] text-brand-600 mt-1 inline-flex items-center gap-0.5"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Hide note' : 'Note'}
            </button>
          )}
          {expanded && (
            <textarea
              className="input w-full mt-2 text-xs min-h-[3rem]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (task.notes || '')) onUpdate(task, { notes });
              }}
              placeholder="Add details…"
            />
          )}
        </div>
        <button type="button" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => onDelete(task)}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

function Section({ title, items, onToggle, onDelete, onUpdate, empty }) {
  if (!items?.length) return empty ? null : null;
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">{title}</h2>
      <ul className="space-y-2">
        {items.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} onUpdate={onUpdate} />
        ))}
      </ul>
    </section>
  );
}

export default function Tasks() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const grouped = useQuery({ queryKey: ['tasksGrouped'], queryFn: getTasksGrouped });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasksGrouped'] });

  const createMut = useMutation({
    mutationFn: () => createTask({ title: title.trim(), due_date: dueDate || null }),
    onSuccess: () => {
      setTitle('');
      setDueDate('');
      invalidate();
    },
  });

  const completeMut = useMutation({
    mutationFn: (t) => completeTask(t.id, !t.completed),
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: ({ t, body }) => updateTask(t.id, body),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (t) => deleteTask(t.id),
    onSuccess: invalidate,
  });

  if (grouped.isLoading) return <LoadingSpinner />;

  const g = grouped.data || { overdue: [], today: [], scheduled: [], noDate: [], completed: [] };
  const hasAny = g.overdue?.length || g.today?.length || g.scheduled?.length || g.noDate?.length;

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quick notes and due dates — like Google Tasks, separate from payments.
        </p>
      </header>

      <form
        className="card p-4 flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) createMut.mutate();
        }}
      >
        <input
          className="input flex-1"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input className="input sm:w-36" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0" disabled={!title.trim() || createMut.isPending}>
          <Plus size={16} />
          Add
        </button>
      </form>

      {!hasAny && !g.completed?.length && (
        <div className="card p-8 text-center text-sm text-gray-400">No tasks yet. Add one above.</div>
      )}

      <Section title="Overdue" items={g.overdue} onToggle={(t) => completeMut.mutate(t)} onDelete={(t) => deleteMut.mutate(t)} onUpdate={(t, body) => updateMut.mutate({ t, body })} />
      <Section title="Today" items={g.today} onToggle={(t) => completeMut.mutate(t)} onDelete={(t) => deleteMut.mutate(t)} onUpdate={(t, body) => updateMut.mutate({ t, body })} />
      <Section title="Scheduled" items={g.scheduled} onToggle={(t) => completeMut.mutate(t)} onDelete={(t) => deleteMut.mutate(t)} onUpdate={(t, body) => updateMut.mutate({ t, body })} />
      <Section title="No date" items={g.noDate} onToggle={(t) => completeMut.mutate(t)} onDelete={(t) => deleteMut.mutate(t)} onUpdate={(t, body) => updateMut.mutate({ t, body })} />

      {g.completed?.length > 0 && (
        <section>
          <button
            type="button"
            className="text-xs text-gray-500 mb-2"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            Completed ({g.completed.length}) {showCompleted ? '▾' : '▸'}
          </button>
          {showCompleted && (
            <ul className="space-y-2 opacity-70">
              {g.completed.map((t) => (
                <TaskRow
                  key={t.id}
                  task={{ ...t, completed: true }}
                  onToggle={(x) => completeMut.mutate(x)}
                  onDelete={(x) => deleteMut.mutate(x)}
                  onUpdate={(x, body) => updateMut.mutate({ x, body })}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
