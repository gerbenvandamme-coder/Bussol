import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCircle2, Circle, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Overlay, SlidingTabs } from '../components/ui';
import { logActivity } from '../lib/data';
import { QUADRANTS, dueInfo, quadrantOf, sortTasks, type Quadrant } from '../lib/priority';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import { cx, tint } from '../lib/util';
import type { Handle, Scope, Task, TaskKind } from '../types';

type View = 'list' | 'matrix';
type ScopeFilter = 'all' | 'mine' | 'shared';

type TaskValues = {
  kind: TaskKind;
  scope: Scope;
  title: string;
  notes: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null;
};

const QUADRANT_ORDER: Quadrant[] = ['do-first', 'schedule', 'quick', 'backlog'];

/* ------------------------------ Kleine delen ------------------------------ */

function Badge({ tone, children }: { tone: string; children: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: tint(tone, 16), color: tone }}
    >
      {children}
    </span>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="glass flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]"
    >
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent-me)' : 'rgba(148,163,184,0.5)' }}
      >
        <span
          className="absolute top-0.5 size-4 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? '1.125rem' : '0.125rem' }}
        />
      </span>
    </button>
  );
}

/* --------------------------------- Formulier -------------------------------- */

function TaskForm({
  initial,
  myHandle,
  onSubmit,
  onCancel,
}: {
  initial: Task | null;
  myHandle: Handle;
  onSubmit: (values: TaskValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? 'todo');
  const [scope, setScope] = useState<Scope>(initial?.scope ?? myHandle);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [urgent, setUrgent] = useState(initial?.urgent ?? false);
  const [important, setImportant] = useState(initial?.important ?? false);
  const [due, setDue] = useState(initial?.due_date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Give it a title.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        kind,
        scope,
        title: cleanTitle,
        notes: notes.trim(),
        urgent,
        important,
        due_date: due || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <SlidingTabs
          id="task-kind"
          ariaLabel="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'todo', label: 'To-do' },
            { value: 'reminder', label: 'Reminder' },
          ]}
        />
        <SlidingTabs
          id="task-scope"
          ariaLabel="Visibility"
          value={scope}
          onChange={setScope}
          options={[
            { value: myHandle, label: 'Personal', color: `var(--accent-${myHandle})` },
            { value: 'shared', label: 'Shared', color: 'var(--accent-shared)' },
          ]}
        />
      </div>

      <Field label="Title" htmlFor="task-title">
        <input
          id="task-title"
          className="field"
          value={title}
          maxLength={200}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field label="Notes" htmlFor="task-notes">
        <textarea
          id="task-notes"
          className="field"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Switch label="Urgent" hint="Needs attention soon" checked={urgent} onChange={setUrgent} />
        <Switch label="Important" hint="Moves the business forward" checked={important} onChange={setImportant} />
      </div>

      <Field label="Deadline" htmlFor="task-due">
        <input id="task-due" className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------- Rij ---------------------------------- */

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { scopeLabel } = useApp();
  const quadrant = QUADRANTS[quadrantOf(task)];
  const due = dueInfo(task.due_date, task.done);
  const KindIcon = task.kind === 'reminder' ? Bell : ListChecks;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="glass flex items-start gap-3 rounded-2xl p-3"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `Mark "${task.title}" as open` : `Mark "${task.title}" as done`}
        onClick={onToggle}
        className="mt-0.5 shrink-0 rounded-full text-slate-400 transition-colors hover:text-[var(--accent-me)] focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]"
        style={task.done ? { color: 'var(--accent-me)' } : undefined}
      >
        {task.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cx('break-words text-sm font-medium', task.done && 'text-slate-400 line-through')}>
          {task.title}
        </p>
        {task.notes && (
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-500 dark:text-slate-400">{task.notes}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <KindIcon size={12} />
            {task.kind === 'reminder' ? 'Reminder' : 'To-do'}
          </span>
          <Badge tone={quadrant.tone}>{quadrant.label}</Badge>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="size-2 rounded-full" style={{ background: `var(--accent-${task.scope})` }} />
            {scopeLabel(task.scope)}
          </span>
          {due && <Badge tone={due.tone}>{due.label}</Badge>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={`Edit "${task.title}"`}
          onClick={onEdit}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)] dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          aria-label={`Delete "${task.title}"`}
          onClick={onDelete}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </motion.li>
  );
}

function TaskList({
  tasks,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onToggle={() => onToggle(t)}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/* ---------------------------------- Pagina --------------------------------- */

export function RemindersPage() {
  const { me } = useApp();
  const { rows, loading, error: loadError, insert, update, remove } = useCollection<Task>('tasks', me?.id ?? null);
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const myHandle = me?.handle;

  const sorted = useMemo(() => {
    if (!myHandle) return [];
    const visible = rows.filter((t) => t.scope === 'shared' || t.scope === myHandle);
    const filtered = visible.filter(
      (t) => filter === 'all' || (filter === 'mine' ? t.scope === myHandle : t.scope === 'shared'),
    );
    return sortTasks(filtered);
  }, [rows, myHandle, filter]);

  if (!me) return null;

  const open = sorted.filter((t) => !t.done);
  const done = sorted.filter((t) => t.done);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const openForm = (task: Task | null) => {
    setEditing(task);
    setFormOpen(true);
  };

  const save = async (values: TaskValues) => {
    if (editing) {
      await update(editing.id, { ...values });
    } else {
      await insert({ ...values, done: false, created_by: me.id });
      // Persoonlijke taken komen bewust niet in de gedeelde activiteitenfeed
      if (values.scope === 'shared') {
        await logActivity(me.id, 'task', `${me.display_name} added "${values.title}"`);
      }
    }
    setFormOpen(false);
  };

  const toggle = (task: Task) => void run(() => update(task.id, { done: !task.done }));

  const askDelete = (task: Task) => {
    if (window.confirm(`Delete "${task.title}"?`)) void run(() => remove(task.id));
  };

  const list = (tasks: Task[]) => (
    <TaskList tasks={tasks} onToggle={toggle} onEdit={openForm} onDelete={askDelete} />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SlidingTabs
            id="rem-view"
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'matrix', label: 'Matrix' },
            ]}
          />
          <SlidingTabs
            id="rem-filter"
            ariaLabel="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'Mine', color: 'var(--accent-me)' },
              { value: 'shared', label: 'Shared', color: 'var(--accent-shared)' },
            ]}
          />
        </div>
        <Button variant="primary" onClick={() => openForm(null)}>
          <Plus size={16} /> New
        </Button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
        {open.length} open · {done.length} done
      </p>

      {(loadError || actionError) && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {actionError ?? loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Loading…</p>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing here yet"
          description="Add a to-do or a reminder. Mark it urgent and/or important and it lands in the right Eisenhower quadrant."
          action={
            <Button variant="primary" onClick={() => openForm(null)}>
              <Plus size={16} /> Add the first one
            </Button>
          }
        />
      ) : view === 'list' ? (
        <div className="space-y-6">
          {open.length > 0 && list(open)}
          {done.length > 0 && (
            <section aria-label="Completed">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Completed ({done.length})
              </h2>
              {list(done)}
            </section>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {QUADRANT_ORDER.map((q) => {
            const meta = QUADRANTS[q];
            const items = open.filter((t) => quadrantOf(t) === q);
            return (
              <section
                key={q}
                aria-label={meta.label}
                className="glass rounded-3xl p-4"
                style={{ borderTopColor: meta.tone, borderTopWidth: 3 }}
              >
                <header className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">{meta.label}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{meta.hint}</p>
                  </div>
                  <Badge tone={meta.tone}>{String(items.length)}</Badge>
                </header>
                {items.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">Empty</p>
                ) : (
                  list(items)
                )}
              </section>
            );
          })}
        </div>
      )}

      <Overlay
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit item' : 'New item'}
      >
        <TaskForm
          key={editing?.id ?? 'new'}
          initial={editing}
          myHandle={me.handle}
          onSubmit={save}
          onCancel={() => setFormOpen(false)}
        />
      </Overlay>
    </div>
  );
}